import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { focusSessions } from "../db/schema"
import { requireUser, type RequireUserVariables } from "../middleware/require-user"
import { UpsertFocusSessionInput } from "../lib/api-schemas"

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
    return c.json({ session: toSessionDTO(row) }, 200)
  })

const toSessionDTO = (row: typeof focusSessions.$inferSelect) => ({
  id: row.id,
  goal: row.goal,
  durationMinutes: row.durationMinutes,
  breakMinutes: row.breakMinutes,
  completed: row.completed,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
})
