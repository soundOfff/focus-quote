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
import {
  classifyUrl,
  cosineSimilarity,
  embed,
  similarityToDistraction,
} from "../lib/llm"
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
 *  1. Resolve the session's anchor (goal, falling back to topic) and embed
 *     it once so we can score this whole batch against the same target.
 *  2. Compute an embedding-similarity distraction score per URL — that's
 *     the headline metric the UI surfaces ("how far did this link drift
 *     from what the user said they were doing").
 *  3. For the *category* (and the kind-nudge text when score is high), we
 *     still use the hostname cache + LLM classifier; both layers are
 *     orthogonal to the score now.
 *  4. Persist + publish to anyone subscribed to the session's SSE stream.
 *
 * Embedding scoring degrades gracefully: when no anchor is available, or
 * when the embeddings provider isn't configured / fails, we fall back to
 * the LLM-derived score (for new hostnames) or the heuristic-by-category
 * score (for cached hostnames) — the same behavior we had before.
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
  // Resolve and embed each session's anchor exactly once for this batch.
  // The anchor is the user-typed goal when present, otherwise the
  // LLM-derived topic (assigned at session-end). We don't fall back further
  // than that; if neither exists, embedding scoring is skipped.
  const anchorBySession = new Map<
    string,
    { text: string; vec: number[] | null } | null
  >()
  for (const sid of new Set(urls.map((u) => u.sessionId))) {
    const [s] = await db
      .select({ goal: focusSessions.goal, topic: focusSessions.topic })
      .from(focusSessions)
      .where(eq(focusSessions.id, sid))
      .limit(1)
    const anchorText =
      (s?.goal && s.goal.trim()) || (s?.topic && s.topic.trim()) || ""
    if (!anchorText) {
      anchorBySession.set(sid, null)
      continue
    }
    const vec = await embed(anchorText)
    anchorBySession.set(sid, { text: anchorText, vec })
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

      // Always try embedding similarity first — it's anchor-aware, fast,
      // and consistent across cached and uncached hostnames alike.
      const anchor = anchorBySession.get(u.sessionId)
      if (anchor?.vec) {
        const urlVec = await embed(buildUrlEmbeddingInput(u))
        if (urlVec) {
          const sim = cosineSimilarity(anchor.vec, urlVec)
          distractionScore = similarityToDistraction(sim)
        }
      }

      if (!cached) {
        if (!tryConsume(userId)) {
          // Token bucket exhausted — skip LLM for this URL. If we already
          // computed an embedding-only score, persist that; otherwise leave
          // the row unclassified for the next pass.
          if (distractionScore === null) continue
        } else {
          const result = await classifyUrl({
            url: u.url,
            title: u.title,
            goal:
              anchor?.text ??
              null,
          })
          if (result) {
            category = result.category
            // Only fall back to the LLM's score if embedding scoring
            // didn't succeed — we trust the deterministic vector more.
            if (distractionScore === null)
              distractionScore = result.distractionScore
            // Nudge thresholds are score-driven, but the LLM's wording is
            // still the best we have. Keep its nudge when the score we
            // landed on (embedding or LLM) crosses the threshold.
            if ((distractionScore ?? 0) >= 70) nudge = result.nudge
            await db
              .insert(urlClassifications)
              .values({ hostname: u.hostname, category })
              .onConflictDoUpdate({
                target: urlClassifications.hostname,
                set: { category },
              })
          } else if (distractionScore === null) {
            continue
          }
        }
      } else if (distractionScore === null) {
        // Cached hostname AND no embedding score — fall back to the old
        // category-based heuristic so we still write *something*.
        distractionScore = heuristicScore(category ?? "")
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

/**
 * Build the short string we embed for a URL. Title carries most of the
 * semantic signal — the URL contributes hostname + slug words for cases
 * where the title is empty or generic ("Untitled"). We avoid embedding
 * raw query strings: they're noisy and rarely carry topical meaning.
 */
const buildUrlEmbeddingInput = (u: {
  url: string
  hostname: string
  title: string | null
}): string => {
  let slug = ""
  try {
    const parsed = new URL(u.url)
    slug = parsed.pathname
      .split("/")
      .filter((p) => p && p.length > 1)
      .join(" ")
      .replace(/[-_]+/g, " ")
  } catch {
    /* malformed URL — skip slug component */
  }
  return [u.title, u.hostname, slug].filter(Boolean).join(" — ").slice(0, 1000)
}

const heuristicScore = (category: string): number => {
  const c = category.toLowerCase()
  if (c.includes("social") || c.includes("entertainment")) return 85
  if (c.includes("news") || c.includes("shopping")) return 65
  if (c.includes("work") || c.includes("research") || c.includes("tools"))
    return 10
  return 40
}
