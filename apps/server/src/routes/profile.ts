import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
import { db } from "../db/client"
import { userMediaRefs, userProfile } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { UserProfileInput } from "../lib/api-schemas"

type ProfileRow = typeof userProfile.$inferSelect

const toDTO = (row: ProfileRow) => ({
  displayName: row.displayName,
  headline: row.headline,
  photoMediaFileId: row.photoMediaFileId,
  updatedAt: row.updatedAt,
})

const loadOrSeed = async (userId: string): Promise<ProfileRow> => {
  const [row] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1)
  if (row) return row
  await db.insert(userProfile).values({ userId }).onConflictDoNothing()
  const [created] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1)
  if (!created) throw new Error("profile_seed_failed")
  return created
}

export const profileRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("user").id
    const row = await loadOrSeed(userId)
    return c.json({ profile: toDTO(row) })
  })
  .put("/", zValidator("json", UserProfileInput), async (c) => {
    const userId = c.get("user").id
    const body = c.req.valid("json")
    const now = new Date().toISOString()
    if (body.photoMediaFileId) {
      const [owned] = await db
        .select({ id: userMediaRefs.id })
        .from(userMediaRefs)
        .where(
          and(
            eq(userMediaRefs.fileId, body.photoMediaFileId),
            eq(userMediaRefs.userId, userId),
          ),
        )
        .limit(1)
      if (!owned) {
        return c.json(
          { error: "Photo not owned by user", code: "NOT_FOUND" },
          404,
        )
      }
    }
    await db
      .insert(userProfile)
      .values({
        userId,
        displayName: body.displayName,
        headline: body.headline,
        photoMediaFileId: body.photoMediaFileId ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: {
          displayName: body.displayName,
          headline: body.headline,
          photoMediaFileId: body.photoMediaFileId ?? null,
          updatedAt: now,
        },
      })
    const [row] = await db
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1)
    if (!row) return c.json({ error: "Upsert failed" }, 500)
    return c.json({ profile: toDTO(row) })
  })
