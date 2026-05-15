import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { and, desc, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { mediaBucketFiles, topicMedia } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { listTopics } from "../lib/topic"

const AttachTopicMediaInput = z.object({
  fileId: z.string().min(1).max(120),
  note: z.string().max(280).nullable().optional(),
})

const decodeTopic = (raw: string) => decodeURIComponent(raw).slice(0, 60)

export const topicsRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("user").id
    const topics = await listTopics(userId)
    return c.json({ topics })
  })
  .get("/:label/media", async (c) => {
    const userId = c.get("user").id
    const topic = decodeTopic(c.req.param("label"))
    const rows = await db
      .select({
        id: topicMedia.id,
        topic: topicMedia.topic,
        fileId: topicMedia.fileId,
        note: topicMedia.note,
        createdAt: topicMedia.createdAt,
        mimeType: mediaBucketFiles.mimeType,
        dataBase64: mediaBucketFiles.dataBase64,
        byteSize: mediaBucketFiles.byteSize,
      })
      .from(topicMedia)
      .innerJoin(mediaBucketFiles, eq(topicMedia.fileId, mediaBucketFiles.id))
      .where(
        and(eq(topicMedia.userId, userId), eq(topicMedia.topic, topic)),
      )
      .orderBy(desc(topicMedia.createdAt))
      .limit(50)
    return c.json({ items: rows })
  })
  .post("/:label/media", zValidator("json", AttachTopicMediaInput), async (c) => {
    const userId = c.get("user").id
    const topic = decodeTopic(c.req.param("label"))
    if (!topic.trim()) {
      return c.json({ error: "Invalid topic", code: "BAD_REQUEST" }, 400)
    }
    const body = c.req.valid("json")
    const [file] = await db
      .select({ id: mediaBucketFiles.id })
      .from(mediaBucketFiles)
      .where(eq(mediaBucketFiles.id, body.fileId))
      .limit(1)
    if (!file) {
      return c.json({ error: "File not found", code: "NOT_FOUND" }, 404)
    }
    const id = randomUUID()
    await db.insert(topicMedia).values({
      id,
      userId,
      topic,
      fileId: body.fileId,
      note: body.note ?? null,
    })
    return c.json({ ok: true, id }, 201)
  })
  .delete("/:label/media/:mediaId", async (c) => {
    const userId = c.get("user").id
    const mediaId = c.req.param("mediaId")
    await db
      .delete(topicMedia)
      .where(and(eq(topicMedia.id, mediaId), eq(topicMedia.userId, userId)))
    return c.json({ ok: true })
  })
