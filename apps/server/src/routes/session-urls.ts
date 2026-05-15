import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, asc, eq, inArray } from "drizzle-orm"
import { db } from "../db/client"
import {
  focusSessions,
  sessionUrls,
  urlClassifications,
} from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import {
  ListSessionUrlsQuery,
  SessionUrlBatchInput,
} from "../lib/api-schemas"
import { classifyUrl } from "../lib/llm"
import { tryConsume } from "../lib/rate-limit"
import { publish } from "../lib/session-bus"

export const sessionUrlsRoutes = new Hono<{
  Variables: RequireUserVariables
}>()
  .use("*", requireUser)
  .get("/", zValidator("query", ListSessionUrlsQuery), async (c) => {
    const userId = c.get("user").id
    const { sessionId } = c.req.valid("query")
    const rows = await db
      .select()
      .from(sessionUrls)
      .where(
        and(
          eq(sessionUrls.userId, userId),
          eq(sessionUrls.sessionId, sessionId),
        ),
      )
      .orderBy(asc(sessionUrls.visitedAt))
      .limit(500)
    return c.json({ urls: rows.map(toDTO) })
  })
  .post("/", zValidator("json", SessionUrlBatchInput), async (c) => {
    const userId = c.get("user").id
    const { urls } = c.req.valid("json")

    // Validate sessions are owned by the user (one lookup per distinct session).
    const distinctSessions = Array.from(new Set(urls.map((u) => u.sessionId)))
    const owned = await db
      .select({ id: focusSessions.id })
      .from(focusSessions)
      .where(eq(focusSessions.userId, userId))
    const ownedIds = new Set(owned.map((r) => r.id))
    for (const sid of distinctSessions) {
      if (!ownedIds.has(sid)) {
        return c.json({ error: "Session not found", code: "NOT_FOUND" }, 404)
      }
    }

    // Insert URL rows (idempotent on id).
    for (const u of urls) {
      await db
        .insert(sessionUrls)
        .values({
          id: u.id,
          userId,
          sessionId: u.sessionId,
          url: u.url,
          hostname: u.hostname,
          title: u.title,
          content: u.content ? u.content.slice(0, 4000) : null,
          visitedAt: u.visitedAt,
        })
        .onConflictDoNothing({ target: sessionUrls.id })
    }

    // Kick off async classification — don't block the response.
    void classifyBatch(userId, urls)

    const ids = urls.map((u) => u.id)
    const inserted = await db
      .select()
      .from(sessionUrls)
      .where(
        and(eq(sessionUrls.userId, userId), inArray(sessionUrls.id, ids)),
      )
    return c.json({ urls: inserted.map(toDTO) })
  })

const toDTO = (row: typeof sessionUrls.$inferSelect) => ({
  id: row.id,
  sessionId: row.sessionId,
  url: row.url,
  hostname: row.hostname,
  title: row.title,
  content: row.content,
  visitedAt: row.visitedAt,
  category: row.category,
  distractionScore: row.distractionScore,
  summary: row.summary,
})

/**
 * Background classification. For each URL:
 *  1. Check hostname cache → skip LLM if hit.
 *  2. Otherwise consume a token-bucket token and call the LLM.
 *  3. Persist category + score + summary.
 *  4. Publish events to anyone subscribed to the session's SSE stream.
 */
const classifyBatch = async (
  userId: string,
  urls: ReadonlyArray<{
    id: string
    sessionId: string
    url: string
    hostname: string
    title: string | null
  }>,
) => {
  // Look up the goal once per distinct session to feed the prompt.
  const goalBySession = new Map<string, string | null>()
  for (const sid of new Set(urls.map((u) => u.sessionId))) {
    const [s] = await db
      .select({ goal: focusSessions.goal })
      .from(focusSessions)
      .where(eq(focusSessions.id, sid))
      .limit(1)
    goalBySession.set(sid, s?.goal ?? null)
  }

  for (const u of urls) {
    try {
      // Cache hit on hostname?
      const [cached] = await db
        .select()
        .from(urlClassifications)
        .where(eq(urlClassifications.hostname, u.hostname))
        .limit(1)

      let category: string | null = cached?.category ?? null
      let distractionScore: number | null = null
      let nudge: string | null = null

      if (!cached) {
        if (!tryConsume(userId)) {
          // Token bucket exhausted — skip LLM for this URL.
          continue
        }
        const result = await classifyUrl({
          url: u.url,
          title: u.title,
          goal: goalBySession.get(u.sessionId) ?? null,
        })
        if (!result) continue
        category = result.category
        distractionScore = result.distractionScore
        nudge = result.nudge
        await db
          .insert(urlClassifications)
          .values({ hostname: u.hostname, category })
          .onConflictDoUpdate({
            target: urlClassifications.hostname,
            set: { category },
          })
      } else {
        // Cached hostname: keep category, still call LLM for score+nudge
        // against THIS goal? For MVP: trust the cached category and use a
        // simple heuristic for distractionScore so we don't burn tokens.
        distractionScore = heuristicScore(category!)
      }

      await db
        .update(sessionUrls)
        .set({
          category,
          distractionScore,
        })
        .where(eq(sessionUrls.id, u.id))

      publish(u.sessionId, {
        type: "classification",
        sessionUrlId: u.id,
        url: u.url,
        category: category ?? "unknown",
        distractionScore: distractionScore ?? 0,
      })
      if (nudge) {
        publish(u.sessionId, {
          type: "nudge",
          sessionUrlId: u.id,
          message: nudge,
        })
      }
    } catch (err) {
      console.warn("[session-urls] classify failed for", u.url, err)
    }
  }
}

const heuristicScore = (category: string): number => {
  const c = category.toLowerCase()
  if (c.includes("social") || c.includes("entertainment")) return 85
  if (c.includes("news") || c.includes("shopping")) return 65
  if (c.includes("work") || c.includes("research") || c.includes("tools"))
    return 10
  return 40
}
