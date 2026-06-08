import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import {
  focusSessions,
  recallAttempts,
  sessionActions,
  sessionUrls,
  sessionVaultItems,
  topics,
} from "../db/schema"
import { requireUser, type RequireUserVariables } from "../middleware/require-user"
import { z } from "zod"
import { UpsertFocusSessionInput } from "../lib/api-schemas"
import { maybeGenerateSummary } from "../lib/summary"
import {
  forceRegenerate,
  maybeGenerateRecallQuestions,
  maybeGenerateResourceRecommendations,
  maybeGenerateStudyTips,
  parseRecallQuestions,
  parseResourceRecommendations,
  parseStudyTips,
} from "../lib/study-artifacts"
import {
  maybeGenerateTitle,
  maybeGenerateTopic,
} from "../lib/topic"
import {
  flushPendingSessionVault,
  saveSessionVaultItem,
} from "../lib/vault"
import { runCompletionDownstream } from "../lib/completion"
import { gradeRecallAnswer } from "../lib/llm"

const VaultLinkInput = z.object({
  url: z.string().min(1).max(2000),
  title: z.string().max(200).nullable().optional(),
})

const AssignTopicInput = z.object({
  topicId: z.string().min(1).max(120),
})

export const focusSessionsRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("user").id
    const rows = await db
      .select()
      .from(focusSessions)
      .where(eq(focusSessions.userId, userId))
      .orderBy(desc(focusSessions.startedAt))
      .limit(200)
    return c.json({ sessions: rows.map(toSessionDTO) })
  })
  // Save a visited link into the session's Topic Vault. Resolves (and lazily
  // creates) the session's Topic entity, then inserts a "url" vault item.
  .post("/:id/vault-link", zValidator("json", VaultLinkInput), async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const { url, title } = c.req.valid("json")
    // No AI on the save path: if the session already has a topic the link lands
    // directly in that Topic Vault; otherwise it is stashed as a PENDING session
    // item and promoted when the session resolves its topic at completion (or to
    // "Uncategorized"). Keeps the save instant and never blocks/fails on topic
    // detection — the user can rename/migrate the resulting topic afterwards.
    const saved = await saveSessionVaultItem(userId, id, {
      kind: "url",
      body: url,
      title: title ?? null,
    })
    if (!saved) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    }
    return c.json({ item: saved }, 201)
  })
  // Pending vault items saved during the session before it has a topic. These
  // are promoted into the session's topic (or "Uncategorized") at completion.
  .get("/:id/vault-pending", async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const items = await db
      .select({
        id: sessionVaultItems.id,
        sessionId: sessionVaultItems.sessionId,
        kind: sessionVaultItems.kind,
        body: sessionVaultItems.body,
        title: sessionVaultItems.title,
        mediaFileId: sessionVaultItems.mediaFileId,
        createdAt: sessionVaultItems.createdAt,
      })
      .from(sessionVaultItems)
      .where(
        and(
          eq(sessionVaultItems.userId, userId),
          eq(sessionVaultItems.sessionId, id),
        ),
      )
      .orderBy(desc(sessionVaultItems.createdAt))
      .limit(100)
    return c.json({ items })
  })
  // Manually assign the session to an existing Topic. Cascades the label onto
  // the session and promotes any pending vault items into that topic.
  .post("/:id/topic", zValidator("json", AssignTopicInput), async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const { topicId } = c.req.valid("json")
    const [session] = await db
      .select({ id: focusSessions.id })
      .from(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      .limit(1)
    if (!session) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    }
    const [topic] = await db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(and(eq(topics.id, topicId), eq(topics.userId, userId)))
      .limit(1)
    if (!topic) {
      return c.json({ error: "Topic not found", code: "NOT_FOUND" }, 404)
    }
    await db
      .update(focusSessions)
      .set({ topic: topic.name, topicId: topic.id })
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
    // Pending items now belong to the chosen topic.
    await flushPendingSessionVault(userId, id)
    const [row] = await db
      .select()
      .from(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      .limit(1)
    return c.json({ session: toSessionDTO(row!) })
  })
  .post("/", zValidator("json", UpsertFocusSessionInput), async (c) => {
    const userId = c.get("user").id
    const body = c.req.valid("json")
    const id = body.id ?? randomUUID()
    const startedAt = body.startedAt ?? new Date().toISOString()

    await db
      .insert(focusSessions)
      .values({
        id,
        userId,
        goal: body.goal ?? null,
        durationMinutes: body.durationMinutes,
        breakMinutes: body.breakMinutes,
        completed: body.completed ?? false,
        startedAt,
        endedAt: body.endedAt ?? null,
      })
      .onConflictDoUpdate({
        target: focusSessions.id,
        set: {
          goal: body.goal ?? null,
          durationMinutes: body.durationMinutes,
          breakMinutes: body.breakMinutes,
          completed: body.completed ?? false,
          endedAt: body.endedAt ?? null,
        },
      })

    const [row] = await db
      .select()
      .from(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      .limit(1)
    if (!row) return c.json({ error: "Upsert failed" }, 500)

    // If the upsert just marked the session complete, run the two-phase
    // completion pipeline (ADR-0004). Fire-and-forget — generation may take a
    // few seconds and we don't want to block the response.
    if (row.completed) {
      void runCompletionDownstream(userId, row.id)
    }

    return c.json({ session: toSessionDTO(row) }, 200)
  })
  .get("/:id/summary", async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const [row] = await db
      .select({
        summary: focusSessions.summary,
        completed: focusSessions.completed,
      })
      .from(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      .limit(1)
    if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)

    // Lazy regeneration: if completed but no summary (e.g. LLM was down when
    // the session ended), try once now. Fire-and-forget so the caller gets
    // an immediate null and can poll/retry later.
    if (row.completed && !row.summary) {
      void maybeGenerateSummary(userId, id)
    }
    const pagesVisited = await db
      .select({
        url: sessionUrls.url,
        title: sessionUrls.title,
        visitedAt: sessionUrls.visitedAt,
      })
      .from(sessionUrls)
      .where(and(eq(sessionUrls.sessionId, id), eq(sessionUrls.userId, userId)))
      .orderBy(desc(sessionUrls.visitedAt))
      .limit(60)

    const actions = await db
      .select({
        kind: sessionActions.kind,
        at: sessionActions.at,
        payload: sessionActions.payload,
      })
      .from(sessionActions)
      .where(
        and(eq(sessionActions.sessionId, id), eq(sessionActions.userId, userId)),
      )
      .orderBy(desc(sessionActions.at))
      .limit(200)

    return c.json({ summary: row.summary, pagesVisited, actions })
  })
  .get("/:id/study-tips", async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const [row] = await db
      .select({
        studyTips: focusSessions.studyTips,
        completed: focusSessions.completed,
      })
      .from(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      .limit(1)
    if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    if (row.completed && !row.studyTips) {
      void maybeGenerateStudyTips(userId, id)
    }
    return c.json({ tips: parseStudyTips(row.studyTips) })
  })
  .get("/:id/recall", async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const [row] = await db
      .select({
        recallQuestions: focusSessions.recallQuestions,
        completed: focusSessions.completed,
      })
      .from(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      .limit(1)
    if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    if (row.completed && !row.recallQuestions) {
      // Opening the detail page is an explicit request to study, so generate
      // even when "auto-generate at session end" is off.
      void maybeGenerateRecallQuestions(userId, id, { onDemand: true })
    }
    return c.json({ questions: parseRecallQuestions(row.recallQuestions) })
  })
  .get("/:id/resources", async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const [row] = await db
      .select({
        resourceRecommendations: focusSessions.resourceRecommendations,
        completed: focusSessions.completed,
      })
      .from(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      .limit(1)
    if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    if (row.completed && !row.resourceRecommendations) {
      void maybeGenerateResourceRecommendations(userId, id)
    }
    return c.json({
      resources: parseResourceRecommendations(row.resourceRecommendations),
    })
  })
  /**
   * Force-regenerate an AI artifact. Clears the cached value and runs
   * the generator. Synchronous so the client can poll the GET right after.
   */
  .post(
    "/:id/regenerate",
    zValidator(
      "json",
      z.object({
        artifact: z.enum([
          "summary",
          "studyTips",
          "recallQuestions",
          "resourceRecommendations",
          "topic",
          "title",
        ]),
      }),
    ),
    async (c) => {
      const userId = c.get("user").id
      const id = c.req.param("id")
      const { artifact } = c.req.valid("json")

      // Ownership check
      const [row] = await db
        .select({ id: focusSessions.id })
        .from(focusSessions)
        .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
        .limit(1)
      if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)

      // Null the relevant column, then regenerate.
      if (artifact === "summary") {
        await db
          .update(focusSessions)
          .set({ summary: null })
          .where(
            and(
              eq(focusSessions.id, id),
              eq(focusSessions.userId, userId),
            ),
          )
        await maybeGenerateSummary(userId, id, { force: true })
      } else if (artifact === "topic") {
        await db
          .update(focusSessions)
          .set({ topic: null })
          .where(
            and(
              eq(focusSessions.id, id),
              eq(focusSessions.userId, userId),
            ),
          )
        await maybeGenerateTopic(userId, id)
      } else if (artifact === "title") {
        await db
          .update(focusSessions)
          .set({ title: null })
          .where(
            and(
              eq(focusSessions.id, id),
              eq(focusSessions.userId, userId),
            ),
          )
        await maybeGenerateTitle(userId, id, { force: true })
      } else {
        // study-artifacts (3 of them)
        await forceRegenerate(userId, id, artifact)
      }

      return c.json({ ok: true })
    },
  )
  /**
   * Grade a user's active-recall answer against the stored expected answer
   * and persist the attempt under `recall_attempts` for cross-device history.
   */
  .post(
    "/:id/recall/grade",
    zValidator(
      "json",
      z.object({
        questionIndex: z.number().int().min(0),
        userAnswer: z.string().max(2000),
      }),
    ),
    async (c) => {
      const userId = c.get("user").id
      const id = c.req.param("id")
      const { questionIndex, userAnswer } = c.req.valid("json")

      const [row] = await db
        .select({ recallQuestions: focusSessions.recallQuestions })
        .from(focusSessions)
        .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
        .limit(1)
      if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
      const questions = parseRecallQuestions(row.recallQuestions)
      if (!questions || !questions[questionIndex]) {
        return c.json({ error: "Question not found", code: "NOT_FOUND" }, 404)
      }
      const q = questions[questionIndex]!
      const grade = await gradeRecallAnswer({
        question: q.q,
        expectedAnswer: q.a,
        userAnswer,
      })
      if (!grade) {
        return c.json(
          {
            error: "Grading failed",
            code: "LLM_UNAVAILABLE",
          },
          503,
        )
      }
      await db.insert(recallAttempts).values({
        id: randomUUID(),
        userId,
        sessionId: id,
        questionIndex,
        userAnswer,
        verdict: grade.verdict,
        feedback: grade.feedback,
      })
      return c.json(grade)
    },
  )

const toSessionDTO = (row: typeof focusSessions.$inferSelect) => ({
  id: row.id,
  goal: row.goal,
  title: row.title,
  durationMinutes: row.durationMinutes,
  breakMinutes: row.breakMinutes,
  completed: row.completed,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
})
