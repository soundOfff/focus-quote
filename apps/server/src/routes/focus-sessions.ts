import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { focusSessions } from "../db/schema"
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
import { maybeGenerateTopic } from "../lib/topic"
import { gradeRecallAnswer } from "../lib/llm"

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

    // If the upsert just marked the session complete, kick off summary
    // generation (fire-and-forget — generation may take a few seconds and
    // we don't want to block the response).
    if (row.completed) {
      if (!row.summary) void maybeGenerateSummary(userId, row.id)
      if (!row.studyTips) void maybeGenerateStudyTips(userId, row.id)
      if (!row.recallQuestions)
        void maybeGenerateRecallQuestions(userId, row.id)
      if (!row.resourceRecommendations)
        void maybeGenerateResourceRecommendations(userId, row.id)
      if (!row.topic) void maybeGenerateTopic(userId, row.id)
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
    return c.json({ summary: row.summary })
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
      void maybeGenerateRecallQuestions(userId, id)
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
      } else {
        // study-artifacts (3 of them)
        await forceRegenerate(userId, id, artifact)
      }

      return c.json({ ok: true })
    },
  )
  /**
   * Grade a user's active-recall answer against the stored expected answer.
   * Stateless on the server: doesn't persist user answers (yet).
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
      return c.json(grade)
    },
  )

const toSessionDTO = (row: typeof focusSessions.$inferSelect) => ({
  id: row.id,
  goal: row.goal,
  durationMinutes: row.durationMinutes,
  breakMinutes: row.breakMinutes,
  completed: row.completed,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
})
