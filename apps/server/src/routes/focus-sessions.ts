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
  topicVaultItems,
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
  ensureTopicId,
  maybeAutoDeriveGoal,
  maybeGenerateTitle,
  maybeGenerateTopic,
} from "../lib/topic"
import { aiFeatureEnabledForUser } from "../lib/ai-gate"
import { gradeRecallAnswer } from "../lib/llm"

const VaultLinkInput = z.object({
  url: z.string().min(1).max(2000),
  title: z.string().max(200).nullable().optional(),
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
    const [session] = await db
      .select({
        id: focusSessions.id,
        topicId: focusSessions.topicId,
        topic: focusSessions.topic,
        goal: focusSessions.goal,
      })
      .from(focusSessions)
      .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      .limit(1)
    if (!session) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    }
    let topicId = session.topicId
    if (!topicId) {
      let topicName = session.topic
      // A live (in-progress) session usually has no topic yet — topics are
      // derived at completion. Try to derive one on demand; otherwise fall back
      // to the session goal so the link still lands under a sensible topic
      // instead of failing for every page.
      if (!topicName) {
        await maybeGenerateTopic(userId, id)
        const [refreshed] = await db
          .select({ topicId: focusSessions.topicId, topic: focusSessions.topic })
          .from(focusSessions)
          .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
          .limit(1)
        if (refreshed?.topicId) topicId = refreshed.topicId
        else topicName = refreshed?.topic ?? session.goal?.trim() ?? null
      }
      if (!topicId) {
        if (!topicName) {
          return c.json(
            { error: "Session has no topic to attach to", code: "BAD_REQUEST" },
            400,
          )
        }
        topicId = await ensureTopicId(userId, topicName)
        await db
          .update(focusSessions)
          .set({ topic: topicName, topicId })
          .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, userId)))
      }
    }
    const itemId = randomUUID()
    const createdAt = new Date().toISOString()
    await db.insert(topicVaultItems).values({
      id: itemId,
      userId,
      topicId,
      kind: "url",
      body: url,
      title: title ?? null,
      createdAt,
    })
    return c.json(
      {
        item: {
          id: itemId,
          topicId,
          kind: "url",
          body: url,
          title: title ?? null,
          createdAt,
        },
      },
      201,
    )
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
      // When the user set no goal, one of two AI fillers labels the session:
      // an opt-in auto-Title (issue #9) or, by default, an auto-derived Goal.
      // Only one runs so we never double-spend or compete for the label.
      const hasGoal = (row.goal ?? "").trim().length > 0
      const downstream = async () => {
        const autoTitle =
          !hasGoal && (await aiFeatureEnabledForUser(userId, "autoTitle"))
        if (!hasGoal && !autoTitle) await maybeAutoDeriveGoal(userId, row.id)
        if (!row.summary) void maybeGenerateSummary(userId, row.id)
        if (!row.studyTips) void maybeGenerateStudyTips(userId, row.id)
        if (!row.recallQuestions)
          void maybeGenerateRecallQuestions(userId, row.id)
        if (!row.resourceRecommendations)
          void maybeGenerateResourceRecommendations(userId, row.id)
        // Topic feeds the title prompt, so on the auto-title path resolve it
        // first (awaited) before deriving the title.
        if (autoTitle) {
          if (!row.topic) await maybeGenerateTopic(userId, row.id)
          await maybeGenerateTitle(userId, row.id)
        } else if (!row.topic) {
          void maybeGenerateTopic(userId, row.id)
        }
      }
      void downstream()
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
