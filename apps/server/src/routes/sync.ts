import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
import { db } from "../db/client"
import { quotes, focusSessions, sessionUrls } from "../db/schema"
import { requireUser, type RequireUserVariables } from "../middleware/require-user"
import { SyncBatchInput, type SyncJobInput } from "../lib/api-schemas"

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
          visitedAt: job.visitedAt,
        })
        .onConflictDoNothing({ target: sessionUrls.id })
      return
    }
  }
}
