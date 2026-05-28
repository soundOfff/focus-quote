import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { focusSessions, sessionUrls, topicMedia, topics } from "../db/schema"
import { generateGoalSummary, generateTopic } from "./llm"

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
 * Topic detection assigns each session one of a fixed set of broad
 * categories (see TOPIC_CATEGORIES in lib/llm.ts) so the UI groups
 * sessions without label fragmentation.
 */

export const maybeGenerateTopic = async (
  userId: string,
  sessionId: string,
): Promise<void> => {
  try {
    const [session] = await db
      .select({
        id: focusSessions.id,
        goal: focusSessions.goal,
        topic: focusSessions.topic,
      })
      .from(focusSessions)
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
      .limit(1)
    if (!session) return
    if (session.topic) return

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

/** Find or create the Topic entity for (userId, name); returns its stable id. */
export const ensureTopicId = async (
  userId: string,
  name: string,
  database: Database = db,
): Promise<string> => {
  const [existing] = await database
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.userId, userId), eq(topics.name, name)))
    .limit(1)
  if (existing) return existing.id
  const id = randomUUID()
  await database.insert(topics).values({ id, userId, name })
  return id
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
 */
export const listTopics = async (userId: string) => {
  // Group by the Topic entity (not the legacy label) so a rename is reflected
  // and each row carries the stable topic id.
  const rows = await db
    .select({
      id: topics.id,
      name: topics.name,
      durationMinutes: focusSessions.durationMinutes,
      startedAt: focusSessions.startedAt,
      endedAt: focusSessions.endedAt,
      completed: focusSessions.completed,
    })
    .from(focusSessions)
    .innerJoin(topics, eq(focusSessions.topicId, topics.id))
    .where(eq(focusSessions.userId, userId))
    .orderBy(desc(focusSessions.startedAt))
    .limit(500)

  // Aggregate in JS — SQLite would need ms-level math we don't have natively.
  const byTopic = new Map<
    string,
    {
      id: string
      name: string
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
      sessionCount: 0,
      completedCount: 0,
      totalActualMs: 0,
      lastUsedAt: r.startedAt,
    }
    cur.sessionCount += 1
    if (r.completed) cur.completedCount += 1
    if (r.endedAt) {
      cur.totalActualMs +=
        new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()
    } else {
      // running or never-ended — use planned duration as a stand-in.
      cur.totalActualMs += r.durationMinutes * 60_000
    }
    if (r.startedAt > cur.lastUsedAt) cur.lastUsedAt = r.startedAt
    byTopic.set(r.id, cur)
  }

  return Array.from(byTopic.values()).sort((a, b) =>
    b.lastUsedAt.localeCompare(a.lastUsedAt),
  )
}

// Re-export sql for any callers (unused here but the migration may need it)
void sql
