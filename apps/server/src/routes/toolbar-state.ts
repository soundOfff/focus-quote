import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
import { db } from "../db/client"
import { toolbarRuntimeState } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { PutToolbarStateInput } from "../lib/api-schemas"

type StateRow = typeof toolbarRuntimeState.$inferSelect

const toDTO = (row: StateRow) => ({
  name: row.name,
  payload: row.payload,
  updatedAt: row.updatedAt,
})

const NAME_RE = /^[a-zA-Z0-9_.-]{1,80}$/

export const toolbarStateRoutes = new Hono<{
  Variables: RequireUserVariables
}>()
  .use("*", requireUser)
  .get("/:name", async (c) => {
    const userId = c.get("user").id
    const name = c.req.param("name")
    if (!NAME_RE.test(name)) {
      return c.json({ error: "Bad state name", code: "BAD_REQUEST" }, 400)
    }
    const [row] = await db
      .select()
      .from(toolbarRuntimeState)
      .where(
        and(
          eq(toolbarRuntimeState.userId, userId),
          eq(toolbarRuntimeState.name, name),
        ),
      )
      .limit(1)
    return c.json({ state: row ? toDTO(row) : null })
  })
  .put("/:name", zValidator("json", PutToolbarStateInput), async (c) => {
    const userId = c.get("user").id
    const name = c.req.param("name")
    if (!NAME_RE.test(name)) {
      return c.json({ error: "Bad state name", code: "BAD_REQUEST" }, 400)
    }
    const { payload } = c.req.valid("json")
    const now = new Date().toISOString()
    await db
      .insert(toolbarRuntimeState)
      .values({ userId, name, payload, updatedAt: now })
      .onConflictDoUpdate({
        target: [toolbarRuntimeState.userId, toolbarRuntimeState.name],
        set: { payload, updatedAt: now },
      })
    const [row] = await db
      .select()
      .from(toolbarRuntimeState)
      .where(
        and(
          eq(toolbarRuntimeState.userId, userId),
          eq(toolbarRuntimeState.name, name),
        ),
      )
      .limit(1)
    if (!row) return c.json({ error: "Upsert failed" }, 500)
    return c.json({ state: toDTO(row) })
  })
