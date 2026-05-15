import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
import { db } from "../db/client"
import { quotes, focusSessions, sessionUrls, sessionActions } from "../db/schema"
import { requireUser, type RequireUserVariables } from "../middleware/require-user"
import { SyncBatchInput, type SyncJobInput } from "../lib/api-schemas"
import { maybeGenerateSummary } from "../lib/summary"
import {
  maybeGenerateRecallQuestions,
  maybeGenerateResourceRecommendations,
  maybeGenerateStudyTips,
} from "../lib/study-artifacts"
import { maybeGenerateTopic } from "../lib/topic"

type Result = { ok: true } | { ok: false; error: string }

export const syncRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .post("/batch", zValidator("json", SyncBatchInput), async (c) => {
    const userId = c.get("user").id
    const { jobs } = c.req.valid("json")
    const results: Result[] = []
    for (const job of jobs) {
      try {
        await applyJob(userId, job)
        results.push({ ok: true })
      } catch (err) {
        results.push({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // After the batch applies, kick off summary generation for any session
    // that just became completed. URL upserts in the same batch land first,
    // so summarizeSession sees the full visit history. Fire-and-forget.
    const completedIds = new Set<string>()
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!
      if (job.kind !== "upsertSession") continue
      if (!job.completed) continue
      if (!results[i]?.ok) continue
      completedIds.add(job.id)
    }
    for (const id of completedIds) {
      void maybeGenerateSummary(userId, id)
      void maybeGenerateStudyTips(userId, id)
      void maybeGenerateRecallQuestions(userId, id)
      void maybeGenerateResourceRecommendations(userId, id)
      void maybeGenerateTopic(userId, id)
    }

    return c.json({ results })
  })

async function applyJob(userId: string, job: SyncJobInput): Promise<void> {
  switch (job.kind) {
    case "upsertQuote": {
      // UUID id collisions across users are negligible; ownership enforced
      // on read/delete via WHERE user_id = ?.
      await db
        .insert(quotes)
        .values({
          id: job.id,
          userId,
          text: job.text,
          sourceUrl: job.sourceUrl,
          sourceTitle: job.sourceTitle,
          tag: job.tag,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })
        .onConflictDoUpdate({
          target: quotes.id,
          set: {
            text: job.text,
            sourceUrl: job.sourceUrl,
            sourceTitle: job.sourceTitle,
            tag: job.tag,
            updatedAt: job.updatedAt,
          },
        })
      return
    }
    case "deleteQuote": {
      await db
        .delete(quotes)
        .where(and(eq(quotes.id, job.id), eq(quotes.userId, userId)))
      return
    }
    case "upsertSession": {
      await db
        .insert(focusSessions)
        .values({
          id: job.id,
          userId,
          goal: job.goal,
          durationMinutes: job.durationMinutes,
          breakMinutes: job.breakMinutes,
          completed: job.completed,
          startedAt: job.startedAt,
          endedAt: job.endedAt,
        })
        .onConflictDoUpdate({
          target: focusSessions.id,
          set: {
            goal: job.goal,
            durationMinutes: job.durationMinutes,
            breakMinutes: job.breakMinutes,
            completed: job.completed,
            endedAt: job.endedAt,
          },
        })
      return
    }
    case "upsertSessionUrl": {
      // Ensure the parent session belongs to this user.
      const [owned] = await db
        .select({ id: focusSessions.id })
        .from(focusSessions)
        .where(
          and(
            eq(focusSessions.id, job.sessionId),
            eq(focusSessions.userId, userId),
          ),
        )
        .limit(1)
      if (!owned) throw new Error("Session not owned by user")

      await db
        .insert(sessionUrls)
        .values({
          id: job.id,
          userId,
          sessionId: job.sessionId,
          url: job.url,
          hostname: job.hostname,
          title: job.title,
            content: job.content ? job.content.slice(0, 4000) : null,
          visitedAt: job.visitedAt,
        })
        .onConflictDoNothing({ target: sessionUrls.id })
      return
    }
    case "upsertSessionAction": {
      const [owned] = await db
        .select({ id: focusSessions.id })
        .from(focusSessions)
        .where(
          and(
            eq(focusSessions.id, job.sessionId),
            eq(focusSessions.userId, userId),
          ),
        )
        .limit(1)
      if (!owned) throw new Error("Session not owned by user")

      await db
        .insert(sessionActions)
        .values({
          id: job.id,
          userId,
          sessionId: job.sessionId,
          kind: job.actionKind,
          payload: job.payload.slice(0, 4000),
          at: job.at,
        })
        .onConflictDoNothing({ target: sessionActions.id })
      return
    }
  }
}
