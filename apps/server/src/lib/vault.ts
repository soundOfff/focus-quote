import { and, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { focusSessions, sessionVaultItems, topicVaultItems } from "../db/schema"
import { ensureTopicId } from "./topic"

type Database = typeof db

/** Shared fallback bucket for vault items we couldn't file under a real topic. */
export const UNCATEGORIZED_TOPIC = "Uncategorized"

export type VaultItemKind = "note" | "url" | "image"

export interface SaveVaultItemInput {
  kind: VaultItemKind
  /** URL for "url", text for "note", source URL for "image". */
  body: string
  title?: string | null
  /** media_bucket_files id — set only for kind "image". */
  mediaFileId?: string | null
}

export interface SavedVaultItem {
  id: string
  /** null while the item is pending (session has no topic yet). */
  topicId: string | null
  /** Originating session, or null for a session-less direct save. */
  sessionId: string | null
  kind: string
  body: string
  title: string | null
  mediaFileId: string | null
  createdAt: string
  /** true when stashed as a session-pending item (not yet under a topic). */
  pending: boolean
  /**
   * true when an identical `url` item already existed (per-topic, or per-session
   * for pending items) and this call returned that existing row instead of
   * inserting a duplicate. Lets callers show "already in vault" rather than
   * "saved" — the save is idempotent.
   */
  alreadyExisted: boolean
}

/** Dedup lookup: an existing `url` item under a topic for this user, or null. */
const findTopicUrl = async (
  database: Database,
  userId: string,
  topicId: string,
  url: string,
) => {
  const [row] = await database
    .select()
    .from(topicVaultItems)
    .where(
      and(
        eq(topicVaultItems.userId, userId),
        eq(topicVaultItems.topicId, topicId),
        eq(topicVaultItems.kind, "url"),
        eq(topicVaultItems.body, url),
      ),
    )
    .limit(1)
  return row ?? null
}

/** Dedup lookup: an existing pending `url` item for this session, or null. */
const findSessionUrl = async (
  database: Database,
  userId: string,
  sessionId: string,
  url: string,
) => {
  const [row] = await database
    .select()
    .from(sessionVaultItems)
    .where(
      and(
        eq(sessionVaultItems.userId, userId),
        eq(sessionVaultItems.sessionId, sessionId),
        eq(sessionVaultItems.kind, "url"),
        eq(sessionVaultItems.body, url),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * Save a vault item against a running/just-finished session. If the session
 * already has a topic the item lands directly in that Topic Vault; otherwise it
 * is stashed as PENDING and promoted when the session later resolves a topic.
 * Returns the saved row, or null when the session doesn't belong to the user.
 */
export const saveSessionVaultItem = async (
  userId: string,
  sessionId: string,
  input: SaveVaultItemInput,
  database: Database = db,
): Promise<SavedVaultItem | null> => {
  const [session] = await database
    .select({ topicId: focusSessions.topicId })
    .from(focusSessions)
    .where(
      and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
    )
    .limit(1)
  if (!session) return null
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const common = {
    id,
    userId,
    kind: input.kind,
    body: input.body,
    title: input.title ?? null,
    mediaFileId: input.mediaFileId ?? null,
    createdAt,
  }
  if (session.topicId) {
    // URL dedup: if this page is already in the destination Topic Vault, return
    // the existing item instead of inserting a duplicate (idempotent save).
    if (input.kind === "url") {
      const existing = await findTopicUrl(
        database,
        userId,
        session.topicId,
        input.body,
      )
      if (existing) {
        return {
          id: existing.id,
          topicId: session.topicId,
          sessionId,
          kind: existing.kind,
          body: existing.body,
          title: existing.title,
          mediaFileId: existing.mediaFileId,
          createdAt: existing.createdAt,
          pending: false,
          alreadyExisted: true,
        }
      }
    }
    await database
      .insert(topicVaultItems)
      .values({ ...common, topicId: session.topicId })
    return {
      id,
      topicId: session.topicId,
      sessionId,
      kind: input.kind,
      body: input.body,
      title: input.title ?? null,
      mediaFileId: input.mediaFileId ?? null,
      createdAt,
      pending: false,
      alreadyExisted: false,
    }
  }
  // No topic yet: dedup against this session's own pending items so a repeat
  // save before topic resolution doesn't stash the same link twice.
  if (input.kind === "url") {
    const existing = await findSessionUrl(database, userId, sessionId, input.body)
    if (existing) {
      return {
        id: existing.id,
        topicId: null,
        sessionId,
        kind: existing.kind,
        body: existing.body,
        title: existing.title,
        mediaFileId: existing.mediaFileId,
        createdAt: existing.createdAt,
        pending: true,
        alreadyExisted: true,
      }
    }
  }
  await database.insert(sessionVaultItems).values({ ...common, sessionId })
  return {
    id,
    topicId: null,
    sessionId,
    kind: input.kind,
    body: input.body,
    title: input.title ?? null,
    mediaFileId: input.mediaFileId ?? null,
    createdAt,
    pending: true,
    alreadyExisted: false,
  }
}

/**
 * Save a vault item with full fallback. With a valid `sessionId` it delegates to
 * {@link saveSessionVaultItem} (pending-or-topic); otherwise — including when the
 * session id is stale/unknown — it files the item directly under the shared
 * "Uncategorized" topic so a quick save (e.g. right-click an image with no
 * active session) is never lost.
 */
export const saveVaultItem = async (
  userId: string,
  input: SaveVaultItemInput & { sessionId?: string | null },
  database: Database = db,
): Promise<SavedVaultItem> => {
  if (input.sessionId) {
    const saved = await saveSessionVaultItem(
      userId,
      input.sessionId,
      input,
      database,
    )
    if (saved) return saved
    // stale/unknown session — fall through to Uncategorized rather than fail.
  }
  const topicId = await ensureTopicId(userId, UNCATEGORIZED_TOPIC, database)
  // URL dedup against the shared Uncategorized bucket (same idempotent save).
  if (input.kind === "url") {
    const existing = await findTopicUrl(database, userId, topicId, input.body)
    if (existing) {
      return {
        id: existing.id,
        topicId,
        sessionId: null,
        kind: existing.kind,
        body: existing.body,
        title: existing.title,
        mediaFileId: existing.mediaFileId,
        createdAt: existing.createdAt,
        pending: false,
        alreadyExisted: true,
      }
    }
  }
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  await database.insert(topicVaultItems).values({
    id,
    userId,
    topicId,
    kind: input.kind,
    body: input.body,
    title: input.title ?? null,
    mediaFileId: input.mediaFileId ?? null,
    createdAt,
  })
  return {
    id,
    topicId,
    sessionId: null,
    kind: input.kind,
    body: input.body,
    title: input.title ?? null,
    mediaFileId: input.mediaFileId ?? null,
    createdAt,
    pending: false,
    alreadyExisted: false,
  }
}

/**
 * Promote every pending vault item saved during `sessionId` into a Topic Vault
 * under `topicId`. Items keep their stable id, kind, body, title, media link and
 * original createdAt; the pending rows are then removed. Idempotent — a second
 * call finds nothing left to move (insert is conflict-safe on the stable id).
 * Returns how many items were promoted.
 */
export const promoteSessionVaultItems = async (
  userId: string,
  sessionId: string,
  topicId: string,
  database: Database = db,
): Promise<number> => {
  const pending = await database
    .select()
    .from(sessionVaultItems)
    .where(
      and(
        eq(sessionVaultItems.userId, userId),
        eq(sessionVaultItems.sessionId, sessionId),
      ),
    )
  if (pending.length === 0) return 0
  await database
    .insert(topicVaultItems)
    .values(
      pending.map((p) => ({
        id: p.id,
        userId,
        topicId,
        kind: p.kind,
        body: p.body,
        title: p.title,
        mediaFileId: p.mediaFileId,
        createdAt: p.createdAt,
      })),
    )
    .onConflictDoNothing()
  await database
    .delete(sessionVaultItems)
    .where(
      and(
        eq(sessionVaultItems.userId, userId),
        eq(sessionVaultItems.sessionId, sessionId),
      ),
    )
  return pending.length
}

/**
 * Resolve a destination Topic for a session's pending vault items and promote
 * them. Prefers the session's own resolved topic; falls back to a shared
 * "Uncategorized" topic so links/images are never lost when no topic could be
 * derived. Only PENDING (session-scoped) items move — items already committed to
 * a topic are untouched. Safe to call repeatedly and to fire-and-forget: it
 * no-ops when nothing is pending. Call AFTER topic resolution
 * (`maybeGenerateTopic` / manual assignment) so it sees the final topicId.
 */
export const flushPendingSessionVault = async (
  userId: string,
  sessionId: string,
  database: Database = db,
): Promise<void> => {
  const stillPending = await database
    .select({ id: sessionVaultItems.id })
    .from(sessionVaultItems)
    .where(
      and(
        eq(sessionVaultItems.userId, userId),
        eq(sessionVaultItems.sessionId, sessionId),
      ),
    )
    .limit(1)
  if (stillPending.length === 0) return

  const [session] = await database
    .select({ topicId: focusSessions.topicId })
    .from(focusSessions)
    .where(
      and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
    )
    .limit(1)
  if (!session) return

  const targetTopicId =
    session.topicId ??
    (await ensureTopicId(userId, UNCATEGORIZED_TOPIC, database))
  await promoteSessionVaultItems(userId, sessionId, targetTopicId, database)
}
