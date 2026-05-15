import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, asc, eq, inArray } from "drizzle-orm"
import { db } from "../db/client"
import { focusSessions, sessionActions } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import {
  ListSessionActionsQuery,
  SessionActionBatchInput,
} from "../lib/api-schemas"

const toDTO = (row: typeof sessionActions.$inferSelect) => ({
  id: row.id,
  sessionId: row.sessionId,
  kind: row.kind as
    | "click"
    | "focus"
    | "blur"
    | "submit"
    | "scroll"
    | "nav",
  payload: row.payload,
  at: row.at,
})

export const sessionActionsRoutes = new Hono<{
  Variables: RequireUserVariables
}>()
  .use("*", requireUser)
  .get("/", zValidator("query", ListSessionActionsQuery), async (c) => {
    const userId = c.get("user").id
    const { sessionId } = c.req.valid("query")
    const rows = await db
      .select()
      .from(sessionActions)
      .where(
        and(
          eq(sessionActions.userId, userId),
          eq(sessionActions.sessionId, sessionId),
        ),
      )
      .orderBy(asc(sessionActions.at))
      .limit(1000)
    return c.json({ actions: rows.map(toDTO) })
  })
  .post("/", zValidator("json", SessionActionBatchInput), async (c) => {
    const userId = c.get("user").id
    const { actions } = c.req.valid("json")

    const distinctSessions = Array.from(new Set(actions.map((a) => a.sessionId)))
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

    for (const a of actions) {
      await db
        .insert(sessionActions)
        .values({
          id: a.id,
          userId,
          sessionId: a.sessionId,
          kind: a.kind,
          payload: a.payload.slice(0, 4000),
          at: a.at,
        })
        .onConflictDoNothing({ target: sessionActions.id })
    }

    const ids = actions.map((a) => a.id)
    const inserted = await db
      .select()
      .from(sessionActions)
      .where(and(eq(sessionActions.userId, userId), inArray(sessionActions.id, ids)))
    return c.json({ actions: inserted.map(toDTO) })
  })
