import { and, asc, eq } from "drizzle-orm"
import { db } from "../db/client"
import { focusSessions, sessionUrls } from "../db/schema"
import { summarizeSession } from "./llm"

/**
 * Generates and persists an AI summary for a completed session, if one
 * doesn't already exist. Fire-and-forget — callers should `void` this.
 *
 * Skips if:
 *  - session doesn't exist / isn't owned by the user
 *  - a summary is already stored
 *  - the LLM isn't configured (summarizeSession returns null)
 *  - the session has no URLs
 */
export const maybeGenerateSummary = async (
  userId: string,
  sessionId: string,
  opts: { force?: boolean } = {},
): Promise<void> => {
  try {
    const [session] = await db
      .select({
        id: focusSessions.id,
        goal: focusSessions.goal,
        summary: focusSessions.summary,
      })
      .from(focusSessions)
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
      .limit(1)

    if (!session) return
    if (!opts.force && session.summary) return // already summarized

    const urls = await db
      .select({
        url: sessionUrls.url,
        title: sessionUrls.title,
        category: sessionUrls.category,
        content: sessionUrls.content,
      })
      .from(sessionUrls)
      .where(
        and(
          eq(sessionUrls.sessionId, sessionId),
          eq(sessionUrls.userId, userId),
        ),
      )
      .orderBy(asc(sessionUrls.visitedAt))
      .limit(60)

    if (urls.length === 0) return

    const summary = await summarizeSession({
      goal: session.goal,
      urls: urls.map((u) => ({
        url: u.url,
        title: u.title,
        category: u.category,
        content: u.content,
      })),
    })

    if (!summary) return

    await db
      .update(focusSessions)
      .set({ summary })
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
  } catch (err) {
    console.warn("[summary] generate failed for", sessionId, err)
  }
}
