import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { db } from "../db/client"
import { userSettings } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { UserSettingsInput } from "../lib/api-schemas"

type SettingsRow = typeof userSettings.$inferSelect

const toDTO = (row: SettingsRow) => ({
  theme: row.theme as "dark" | "light",
  defaultDurationMinutes: row.defaultDurationMinutes,
  defaultBreakMinutes: row.defaultBreakMinutes,
  translateFromLang: row.translateFromLang,
  translateToLang: row.translateToLang,
  todayGoal: row.todayGoal,
  debugOverlayEnabled: row.debugOverlayEnabled,
  notificationsBlocked: row.notificationsBlocked,
  toolbarSide: row.toolbarSide as "left" | "right",
  updatedAt: row.updatedAt,
})

const loadOrSeed = async (userId: string): Promise<SettingsRow> => {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  if (row) return row
  await db.insert(userSettings).values({ userId }).onConflictDoNothing()
  const [created] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  if (!created) throw new Error("settings_seed_failed")
  return created
}

export const settingsRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("user").id
    const row = await loadOrSeed(userId)
    return c.json({ settings: toDTO(row) })
  })
  .put("/", zValidator("json", UserSettingsInput), async (c) => {
    const userId = c.get("user").id
    const body = c.req.valid("json")
    const now = new Date().toISOString()
    await db
      .insert(userSettings)
      .values({
        userId,
        theme: body.theme,
        defaultDurationMinutes: body.defaultDurationMinutes,
        defaultBreakMinutes: body.defaultBreakMinutes,
        translateFromLang: body.translateFromLang,
        translateToLang: body.translateToLang,
        todayGoal: body.todayGoal ?? null,
        debugOverlayEnabled: body.debugOverlayEnabled ?? false,
        notificationsBlocked: body.notificationsBlocked ?? false,
        toolbarSide: body.toolbarSide ?? "right",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          theme: body.theme,
          defaultDurationMinutes: body.defaultDurationMinutes,
          defaultBreakMinutes: body.defaultBreakMinutes,
          translateFromLang: body.translateFromLang,
          translateToLang: body.translateToLang,
          todayGoal: body.todayGoal ?? null,
          debugOverlayEnabled: body.debugOverlayEnabled ?? false,
          notificationsBlocked: body.notificationsBlocked ?? false,
          toolbarSide: body.toolbarSide ?? "right",
          updatedAt: now,
        },
      })
    const [row] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1)
    if (!row) return c.json({ error: "Upsert failed" }, 500)
    return c.json({ settings: toDTO(row) })
  })
