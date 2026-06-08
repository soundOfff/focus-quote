import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { focusSessions, sessionUrls, topicMedia, topics } from "../db/schema"
import { generateGoalSummary, generateSessionTitle, generateTopic } from "./llm"
import { aiFeatureEnabledForUser, loadAiGateSettings } from "./ai-gate"

type Database = typeof db

/**
 * If a session was started without a goal, try to infer one from the URLs
 * visited during the session and persist it. Fail open — if the LLM is
 * unavailable, the goal stays null and the UI shows "No goal".
 */
export const maybeAutoDeriveGoal = async (
  userId: string,
  sessionId: string,
): Promise<void> => {
  try {
    if (!(await loadAiGateSettings(userId)).masterEnabled) return
    const [session] = await db
      .select({
        id: focusSessions.id,
        goal: focusSessions.goal,
      })
      .from(focusSessions)
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
      .limit(1)
    if (!session) return
    if (session.goal && session.goal.trim().length > 0) return

    const urls = await db
      .select({
        url: sessionUrls.url,
        title: sessionUrls.title,
        category: sessionUrls.category,
      })
      .from(sessionUrls)
      .where(
        and(
          eq(sessionUrls.sessionId, sessionId),
          eq(sessionUrls.userId, userId),
        ),
      )
      .orderBy(asc(sessionUrls.visitedAt))
      .limit(30)
    if (urls.length === 0) return

    const goal = await generateGoalSummary({ goal: null, urls })
    if (!goal) return

    await db
      .update(focusSessions)
      .set({ goal })
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
  } catch (err) {
    console.warn("[topic] auto-derive goal failed for", sessionId, err)
  }
}

/**
 * Auto-Title (issue #9). When the autoTitle feature is opted in AND the user
 * set no goal, derive a short session title from the session's Topic + visited
 * URLs and store it under `title`. Never touches `goal` — the title is a
 * separate label shown only when the goal is empty. Skips when a title already
 * exists (unless `force`). Self-gating + fail-open, so it is safe to `void`
 * from any completion path.
 */
export const maybeGenerateTitle = async (
  userId: string,
  sessionId: string,
  opts: { force?: boolean } = {},
): Promise<void> => {
  try {
    if (!(await aiFeatureEnabledForUser(userId, "autoTitle"))) return
    const [session] = await db
      .select({
        id: focusSessions.id,
        goal: focusSessions.goal,
        title: focusSessions.title,
        topic: focusSessions.topic,
      })
      .from(focusSessions)
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
      .limit(1)
    if (!session) return
    // A real goal owns the label — never compete with or overwrite it.
    if (session.goal && session.goal.trim().length > 0) return
    if (!opts.force && session.title) return

    const urls = await db
      .select({
        url: sessionUrls.url,
        title: sessionUrls.title,
        category: sessionUrls.category,
      })
      .from(sessionUrls)
      .where(
        and(
          eq(sessionUrls.sessionId, sessionId),
          eq(sessionUrls.userId, userId),
        ),
      )
      .orderBy(asc(sessionUrls.visitedAt))
      .limit(30)
    if (urls.length === 0) return

    const title = await generateSessionTitle({ topic: session.topic, urls })
    if (!title) return

    await db
      .update(focusSessions)
      .set({ title })
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
  } catch (err) {
    console.warn("[topic] auto-title failed for", sessionId, err)
  }
}

/**
 * Topic detection assigns each session one of a fixed set of broad
 * categories (see TOPIC_CATEGORIES in lib/llm.ts) so the UI groups
 * sessions without label fragmentation.
 */

export const maybeGenerateTopic = async (
  userId: string,
  sessionId: string,
): Promise<void> => {
  try {
    if (!(await loadAiGateSettings(userId)).masterEnabled) return
    const [session] = await db
      .select({
        id: focusSessions.id,
        goal: focusSessions.goal,
        topicId: focusSessions.topicId,
      })
      .from(focusSessions)
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
      .limit(1)
    if (!session) return
    // Gate on the stable topicId (the identity, per ADR-0001) — not the mutable
    // legacy `topic` label. A session that already resolved a Topic must not be
    // reclassified even if its label string was cleared or never backfilled.
    if (session.topicId) return

    const urls = await db
      .select({
        url: sessionUrls.url,
        title: sessionUrls.title,
        category: sessionUrls.category,
      })
      .from(sessionUrls)
      .where(
        and(
          eq(sessionUrls.sessionId, sessionId),
          eq(sessionUrls.userId, userId),
        ),
      )
      .orderBy(asc(sessionUrls.visitedAt))
      .limit(30)

    const topic = await generateTopic({
      goal: session.goal,
      urls,
    })
    if (!topic) return

    // Link the session to the first-class Topic entity (ADR 0001), creating it
    // on first use, so the entity stays the source of truth — not the label.
    const topicId = await ensureTopicId(userId, topic)
    await db
      .update(focusSessions)
      .set({ topic, topicId })
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
  } catch (err) {
    console.warn("[topic] generate failed for", sessionId, err)
  }
}

/**
 * Find or create the Topic entity for (userId, name); returns its stable id.
 * Safe under concurrent first-use of the same brand-new name: the insert is a
 * no-op on the (userId, name) unique index, then we re-read whichever row won,
 * so racing completions converge on a single Topic instead of throwing a
 * UNIQUE-constraint error.
 */
export const ensureTopicId = async (
  userId: string,
  name: string,
  database: Database = db,
): Promise<string> => {
  const selectId = () =>
    database
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.userId, userId), eq(topics.name, name)))
      .limit(1)

  const [existing] = await selectId()
  if (existing) return existing.id

  await database
    .insert(topics)
    .values({ id: randomUUID(), userId, name })
    .onConflictDoNothing({ target: [topics.userId, topics.name] })

  // Re-read to resolve the winner (our insert, or a concurrent caller's).
  const [resolved] = await selectId()
  if (!resolved) {
    throw new Error(`ensureTopicId: failed to resolve topic "${name}"`)
  }
  return resolved.id
}

export interface BackfillTopicsResult {
  topicsCreated: number
  sessionsLinked: number
  mediaLinked: number
}

/**
 * One-time migration backfill (ADR 0001): create a Topic entity per distinct
 * (userId, legacy label) and repoint focus sessions + topic media at it.
 * Idempotent — only rows whose topic_id is still null are touched, so it is
 * safe to re-run.
 */
export const backfillTopics = async (
  database: Database = db,
): Promise<BackfillTopicsResult> => {
  const result: BackfillTopicsResult = {
    topicsCreated: 0,
    sessionsLinked: 0,
    mediaLinked: 0,
  }

  const link = async (userId: string, name: string) => {
    const [found] = await database
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.userId, userId), eq(topics.name, name)))
      .limit(1)
    let topicId: string
    if (found) {
      topicId = found.id
    } else {
      topicId = randomUUID()
      await database.insert(topics).values({ id: topicId, userId, name })
      result.topicsCreated++
    }
    const linkedSessions = await database
      .update(focusSessions)
      .set({ topicId })
      .where(
        and(
          eq(focusSessions.userId, userId),
          eq(focusSessions.topic, name),
          isNull(focusSessions.topicId),
        ),
      )
      .returning({ id: focusSessions.id })
    result.sessionsLinked += linkedSessions.length
    const linkedMedia = await database
      .update(topicMedia)
      .set({ topicId })
      .where(
        and(
          eq(topicMedia.userId, userId),
          eq(topicMedia.topic, name),
          isNull(topicMedia.topicId),
        ),
      )
      .returning({ id: topicMedia.id })
    result.mediaLinked += linkedMedia.length
  }

  const pendingSessions = await database
    .selectDistinct({
      userId: focusSessions.userId,
      topic: focusSessions.topic,
    })
    .from(focusSessions)
    .where(
      and(isNotNull(focusSessions.topic), isNull(focusSessions.topicId)),
    )
  for (const row of pendingSessions) {
    if (row.topic) await link(row.userId, row.topic)
  }

  // Media whose label never matched a session (orphan labels) — link them too.
  const pendingMedia = await database
    .selectDistinct({ userId: topicMedia.userId, topic: topicMedia.topic })
    .from(topicMedia)
    .where(isNull(topicMedia.topicId))
  for (const row of pendingMedia) {
    if (row.topic) await link(row.userId, row.topic)
  }

  return result
}

/**
 * Aggregates topics across the user's sessions: count + total time + last used.
 * Drives from the Topic entity (LEFT JOIN sessions) so freshly-created topics
 * with no sessions yet still show up — otherwise they'd be persisted but
 * invisible until their first session linked them in.
 */
export const listTopics = async (userId: string) => {
  // Group by the Topic entity (not the legacy label) so a rename is reflected
  // and each row carries the stable topic id.
  const rows = await db
    .select({
      id: topics.id,
      name: topics.name,
      createdAt: topics.createdAt,
      sessionId: focusSessions.id,
      durationMinutes: focusSessions.durationMinutes,
      startedAt: focusSessions.startedAt,
      endedAt: focusSessions.endedAt,
      completed: focusSessions.completed,
    })
    .from(topics)
    .leftJoin(
      focusSessions,
      and(
        eq(focusSessions.topicId, topics.id),
        eq(focusSessions.userId, userId),
      ),
    )
    .where(eq(topics.userId, userId))
    .orderBy(desc(focusSessions.startedAt))
    .limit(500)

  // Aggregate in JS — SQLite would need ms-level math we don't have natively.
  const byTopic = new Map<
    string,
    {
      id: string
      name: string
      createdAt: string
      sessionCount: number
      completedCount: number
      totalActualMs: number
      lastUsedAt: string
    }
  >()
  for (const r of rows) {
    const cur = byTopic.get(r.id) ?? {
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      sessionCount: 0,
      completedCount: 0,
      totalActualMs: 0,
      // Fall back to the topic's own createdAt for session-less topics.
      lastUsedAt: r.startedAt ?? r.createdAt,
    }
    // Session-less topics produce a single LEFT JOIN row with null session
    // fields — count it as a topic, but not as a session.
    if (r.sessionId && r.startedAt) {
      cur.sessionCount += 1
      if (r.completed) cur.completedCount += 1
      if (r.endedAt) {
        cur.totalActualMs +=
          new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()
      } else {
        // running or never-ended — use planned duration as a stand-in.
        cur.totalActualMs += (r.durationMinutes ?? 0) * 60_000
      }
      if (r.startedAt > cur.lastUsedAt) cur.lastUsedAt = r.startedAt
    }
    byTopic.set(r.id, cur)
  }

  // Stable order: oldest topic first (created_at ASC). Creating or using a
  // topic never reshuffles the list — new topics simply append at the end.
  return Array.from(byTopic.values())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((t) => ({
      id: t.id,
      name: t.name,
      sessionCount: t.sessionCount,
      completedCount: t.completedCount,
      totalActualMs: t.totalActualMs,
      lastUsedAt: t.lastUsedAt,
    }))
}

// Re-export sql for any callers (unused here but the migration may need it)
void sql
