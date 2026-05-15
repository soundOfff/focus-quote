import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { db } from "../db/client"
import { userPrivacy } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { UserPrivacyInput } from "../lib/api-schemas"

type PrivacyRow = typeof userPrivacy.$inferSelect

const parseBlocklist = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((it): it is string => typeof it === "string")
      : []
  } catch {
    return []
  }
}

const toDTO = (row: PrivacyRow) => ({
  trackUrls: row.trackUrls,
  blocklist: parseBlocklist(row.blocklist),
  updatedAt: row.updatedAt,
})

const loadOrSeed = async (userId: string): Promise<PrivacyRow> => {
  const [row] = await db
    .select()
    .from(userPrivacy)
    .where(eq(userPrivacy.userId, userId))
    .limit(1)
  if (row) return row
  await db.insert(userPrivacy).values({ userId }).onConflictDoNothing()
  const [created] = await db
    .select()
    .from(userPrivacy)
    .where(eq(userPrivacy.userId, userId))
    .limit(1)
  if (!created) throw new Error("privacy_seed_failed")
  return created
}

export const privacyRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("user").id
    const row = await loadOrSeed(userId)
    return c.json({ privacy: toDTO(row) })
  })
  .put("/", zValidator("json", UserPrivacyInput), async (c) => {
    const userId = c.get("user").id
    const body = c.req.valid("json")
    const now = new Date().toISOString()
    const blocklistJson = JSON.stringify(body.blocklist)
    await db
      .insert(userPrivacy)
      .values({
        userId,
        trackUrls: body.trackUrls,
        blocklist: blocklistJson,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userPrivacy.userId,
        set: {
          trackUrls: body.trackUrls,
          blocklist: blocklistJson,
          updatedAt: now,
        },
      })
    const [row] = await db
      .select()
      .from(userPrivacy)
      .where(eq(userPrivacy.userId, userId))
      .limit(1)
    if (!row) return c.json({ error: "Upsert failed" }, 500)
    return c.json({ privacy: toDTO(row) })
  })
