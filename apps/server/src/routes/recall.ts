import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, asc, eq } from "drizzle-orm"
import { db } from "../db/client"
import { focusSessions, recallAttempts } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { ListRecallAttemptsQuery } from "../lib/api-schemas"

type AttemptRow = typeof recallAttempts.$inferSelect

const toDTO = (row: AttemptRow) => ({
  id: row.id,
  sessionId: row.sessionId,
  questionIndex: row.questionIndex,
  userAnswer: row.userAnswer,
  verdict: row.verdict as "correct" | "partial" | "incorrect",
  feedback: row.feedback,
  gradedAt: row.gradedAt,
})

export const recallRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/attempts", zValidator("query", ListRecallAttemptsQuery), async (c) => {
    const userId = c.get("user").id
    const { sessionId } = c.req.valid("query")
    const [owned] = await db
      .select({ id: focusSessions.id })
      .from(focusSessions)
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
      .limit(1)
    if (!owned) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    const rows = await db
      .select()
      .from(recallAttempts)
      .where(
        and(
          eq(recallAttempts.sessionId, sessionId),
          eq(recallAttempts.userId, userId),
        ),
      )
      .orderBy(asc(recallAttempts.gradedAt))
      .limit(500)
    return c.json({ attempts: rows.map(toDTO) })
  })
