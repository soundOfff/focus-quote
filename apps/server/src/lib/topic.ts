import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "../db/client"
import { focusSessions, sessionUrls } from "../db/schema"
import { generateGoalSummary, generateTopic } from "./llm"

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

    await db
      .update(focusSessions)
      .set({ topic })
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
  } catch (err) {
    console.warn("[topic] generate failed for", sessionId, err)
  }
}

/**
 * Aggregates topics across the user's sessions: count + total time + last used.
 */
export const listTopics = async (userId: string) => {
  const rows = await db
    .select({
      topic: focusSessions.topic,
      durationMinutes: focusSessions.durationMinutes,
      startedAt: focusSessions.startedAt,
      endedAt: focusSessions.endedAt,
      completed: focusSessions.completed,
    })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        isNotNull(focusSessions.topic),
      ),
    )
    .orderBy(desc(focusSessions.startedAt))
    .limit(500)

  // Aggregate in JS — SQLite would need ms-level math we don't have natively.
  const byTopic = new Map<
    string,
    {
      sessionCount: number
      completedCount: number
      totalActualMs: number
      lastUsedAt: string
    }
  >()
  for (const r of rows) {
    if (!r.topic) continue
    const cur = byTopic.get(r.topic) ?? {
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
    byTopic.set(r.topic, cur)
  }

  return Array.from(byTopic.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
}

// Re-export sql for any callers (unused here but the migration may need it)
void sql
