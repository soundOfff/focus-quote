import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq } from "drizzle-orm"
import { db } from "../db/client"
import {
  quotes,
  focusSessions,
  sessionUrls,
  sessionActions,
  aiChatThreads,
  aiChatMessages,
} from "../db/schema"
import { requireUser, type RequireUserVariables } from "../middleware/require-user"
import { SyncBatchInput, type SyncJobInput } from "../lib/api-schemas"
import { runCompletionDownstream } from "../lib/completion"
import {
  attachQuoteTag,
  deleteTag,
  detachQuoteTag,
  maybeCategorizeQuote,
  upsertManualTag,
} from "../lib/tags"

type Result = { ok: true; deduped?: true } | { ok: false; error: string }

const isUniqueConstraintViolation = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false
  const e = err as { code?: unknown; message?: unknown }
  const msg =
    typeof e.message === "string" ? e.message : String((err as Error).message ?? "")
  return (
    e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    e.code === "SQLITE_CONSTRAINT" ||
    msg.includes("UNIQUE constraint failed") ||
    msg.includes("quotes_user_content_hash_uq")
  )
}

export const syncRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .post("/batch", zValidator("json", SyncBatchInput), async (c) => {
    const userId = c.get("user").id
    const { jobs } = c.req.valid("json")
    const results: Result[] = []
    for (const job of jobs) {
      try {
        const r = await applyJob(userId, job)
        results.push(r?.deduped ? { ok: true, deduped: true } : { ok: true })
      } catch (err) {
        results.push({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // After the batch applies, run the two-phase completion pipeline (ADR-0004)
    // for any session that just became completed. URL upserts in the same batch
    // land first, so generation sees the full visit history. Fire-and-forget.
    const completedIds = new Set<string>()
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!
      if (job.kind !== "upsertSession") continue
      if (!job.completed) continue
      if (!results[i]?.ok) continue
      completedIds.add(job.id)
    }
    for (const id of completedIds) {
      void runCompletionDownstream(userId, id)
    }

    // File pending quotes into the Tag graph (ADR 0003). We sweep the user's
    // pending quotes rather than only the just-upserted ids, so a quote the
    // per-Save rate-limit or a transient model outage left pending gets retried
    // on a later sync tick (drains run periodically). Each call is self-gated +
    // rate-limited and serialized per user, so this is bounded and safe to
    // fire-and-forget. We only bother when this batch actually touched quotes.
    const sawQuoteUpsert = jobs.some(
      (j, i) => j.kind === "upsertQuote" && results[i]?.ok,
    )
    if (sawQuoteUpsert) {
      const pending = await db
        .select({ id: quotes.id })
        .from(quotes)
        .where(
          and(
            eq(quotes.userId, userId),
            eq(quotes.categorizationStatus, "pending"),
          ),
        )
        .orderBy(desc(quotes.createdAt))
        .limit(25)
      for (const row of pending) void maybeCategorizeQuote(userId, row.id)
    }

    return c.json({ results })
  })

async function applyJob(
  userId: string,
  job: SyncJobInput,
): Promise<{ deduped?: true } | void> {
  switch (job.kind) {
    case "upsertQuote": {
      // Re-sending the same id from one device is idempotent
      // (last-write-wins via onConflictDoUpdate on quotes.id). A *different*
      // id carrying the same trimmed text (cross-device duplicate) is
      // rejected by the (user_id, content_hash) partial unique index; we
      // catch the violation and surface it as `deduped: true` so the client
      // can drop its local copy without retrying.
      try {
        await db
          .insert(quotes)
          .values({
            id: job.id,
            userId,
            text: job.text,
            sourceUrl: job.sourceUrl,
            sourceTitle: job.sourceTitle,
            // New quotes start "pending" (ADR 0003); the per-Save Haiku pass
            // kicked after the batch files them into the Tag graph. On a
            // re-upsert we deliberately don't reset the status (see set below).
            categorizationStatus: "pending",
            contentHash: job.contentHash,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
          })
          .onConflictDoUpdate({
            target: quotes.id,
            set: {
              text: job.text,
              sourceUrl: job.sourceUrl,
              sourceTitle: job.sourceTitle,
              contentHash: job.contentHash,
              updatedAt: job.updatedAt,
            },
          })
      } catch (err) {
        if (isUniqueConstraintViolation(err)) return { deduped: true }
        throw err
      }
      return
    }
    case "upsertTag": {
      await upsertManualTag(userId, {
        id: job.id,
        name: job.name,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })
      return
    }
    case "deleteTag": {
      await deleteTag(userId, job.id)
      return
    }
    case "attachQuoteTag": {
      await attachQuoteTag(userId, {
        quoteId: job.quoteId,
        tagId: job.tagId,
        createdAt: job.createdAt,
      })
      return
    }
    case "detachQuoteTag": {
      await detachQuoteTag(userId, {
        quoteId: job.quoteId,
        tagId: job.tagId,
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
    case "upsertChatThread": {
      // The thread id is derived client-side from the article URL alone, so two
      // users highlighting the same article could collide on it. Guard against
      // cross-user writes: ack-and-skip a colliding id owned by someone else
      // (returns ok so the client drops it rather than retrying forever).
      const [existing] = await db
        .select({ id: aiChatThreads.id, userId: aiChatThreads.userId })
        .from(aiChatThreads)
        .where(eq(aiChatThreads.id, job.id))
        .limit(1)
      if (existing) {
        if (existing.userId !== userId) return
        await db
          .update(aiChatThreads)
          .set({
            passage: job.passage,
            sourceUrl: job.sourceUrl,
            updatedAt: job.updatedAt,
          })
          .where(
            and(eq(aiChatThreads.id, job.id), eq(aiChatThreads.userId, userId)),
          )
        return
      }
      await db
        .insert(aiChatThreads)
        .values({
          id: job.id,
          userId,
          kind: "quote_assistant",
          passage: job.passage,
          sourceUrl: job.sourceUrl,
          goal: null,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })
        .onConflictDoNothing({ target: aiChatThreads.id })
      return
    }
    case "appendChatMessage": {
      const [owned] = await db
        .select({ id: aiChatThreads.id })
        .from(aiChatThreads)
        .where(
          and(
            eq(aiChatThreads.id, job.threadId),
            eq(aiChatThreads.userId, userId),
          ),
        )
        .limit(1)
      if (!owned) throw new Error("Thread not owned by user")

      await db
        .insert(aiChatMessages)
        .values({
          id: job.id,
          threadId: job.threadId,
          userId,
          role: job.role,
          content: job.content,
          createdAt: job.createdAt,
        })
        .onConflictDoNothing({ target: aiChatMessages.id })
      await db
        .update(aiChatThreads)
        .set({ updatedAt: job.createdAt })
        .where(eq(aiChatThreads.id, job.threadId))
      return
    }
  }
}
