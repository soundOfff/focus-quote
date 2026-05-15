import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { focusSessions, mediaBucketFiles, userMediaRefs } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { ListMediaQuery, UploadMediaInput } from "../lib/api-schemas"

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"])

const toDTO = (
  file: typeof mediaBucketFiles.$inferSelect,
  ref: typeof userMediaRefs.$inferSelect,
) => ({
  file: {
    id: file.id,
    mimeType: file.mimeType,
    dataBase64: file.dataBase64,
    byteSize: file.byteSize,
    createdAt: file.createdAt,
  },
  ref: {
    id: ref.id,
    userId: ref.userId,
    fileId: ref.fileId,
    kind: ref.kind as "profile_photo" | "screenshot",
    sessionId: ref.sessionId,
    createdAt: ref.createdAt,
  },
})

export const mediaRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .post("/", zValidator("json", UploadMediaInput), async (c) => {
    const userId = c.get("user").id
    const body = c.req.valid("json")

    if (!ALLOWED_MIME.has(body.mimeType)) {
      return c.json({ error: "Unsupported mime type", code: "BAD_REQUEST" }, 400)
    }
    if (body.sessionId) {
      const [owned] = await db
        .select({ id: focusSessions.id })
        .from(focusSessions)
        .where(
          and(
            eq(focusSessions.id, body.sessionId),
            eq(focusSessions.userId, userId),
          ),
        )
        .limit(1)
      if (!owned) {
        return c.json({ error: "Session not found", code: "NOT_FOUND" }, 404)
      }
    }

    const fileId = randomUUID()
    const refId = randomUUID()
    await db.insert(mediaBucketFiles).values({
      id: fileId,
      mimeType: body.mimeType,
      dataBase64: body.dataBase64,
      byteSize: body.byteSize,
    })
    await db.insert(userMediaRefs).values({
      id: refId,
      userId,
      fileId,
      kind: body.kind,
      sessionId: body.sessionId ?? null,
    })

    const [file] = await db
      .select()
      .from(mediaBucketFiles)
      .where(eq(mediaBucketFiles.id, fileId))
      .limit(1)
    const [ref] = await db
      .select()
      .from(userMediaRefs)
      .where(eq(userMediaRefs.id, refId))
      .limit(1)
    if (!file || !ref) {
      return c.json({ error: "Upload failed", code: "SERVER_ERROR" }, 500)
    }
    return c.json(toDTO(file, ref), 201)
  })
  .get("/", zValidator("query", ListMediaQuery), async (c) => {
    const userId = c.get("user").id
    const { kind, sessionId, limit = 50 } = c.req.valid("query")
    const conditions = [eq(userMediaRefs.userId, userId)]
    if (kind) conditions.push(eq(userMediaRefs.kind, kind))
    if (sessionId) conditions.push(eq(userMediaRefs.sessionId, sessionId))
    const refs = await db
      .select()
      .from(userMediaRefs)
      .where(and(...conditions))
      .orderBy(desc(userMediaRefs.createdAt))
      .limit(limit)
    const items = await Promise.all(
      refs.map(async (ref) => {
        const [file] = await db
          .select()
          .from(mediaBucketFiles)
          .where(eq(mediaBucketFiles.id, ref.fileId))
          .limit(1)
        return file ? toDTO(file, ref) : null
      }),
    )
    return c.json({ items: items.filter((it) => it !== null) })
  })
  .get("/:id", async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const [ref] = await db
      .select()
      .from(userMediaRefs)
      .where(and(eq(userMediaRefs.fileId, id), eq(userMediaRefs.userId, userId)))
      .limit(1)
    if (!ref) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    const [file] = await db
      .select()
      .from(mediaBucketFiles)
      .where(eq(mediaBucketFiles.id, id))
      .limit(1)
    if (!file) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    return c.json(toDTO(file, ref))
  })
