import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { and, desc, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import {
  focusSessions,
  mediaBucketFiles,
  topicMedia,
  topicVaultItems,
  topics,
} from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { listTopics } from "../lib/topic"
import { CreateTopicInput } from "../lib/api-schemas"

const AttachTopicMediaInput = z.object({
  fileId: z.string().min(1).max(120),
  note: z.string().max(280).nullable().optional(),
})

const RenameTopicInput = z.object({
  name: z.string().min(1).max(60),
})

const CreateVaultItemInput = z.object({
  kind: z.enum(["note", "url"]),
  body: z.string().min(1).max(2000),
  title: z.string().max(200).nullable().optional(),
})

const decodeTopic = (raw: string) => decodeURIComponent(raw).slice(0, 60)

export const topicsRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("user").id
    const list = await listTopics(userId)
    return c.json({ topics: list })
  })
  // Create a Topic up-front (topics are otherwise auto-derived from sessions).
  // Brand-new topics have no sessions yet, so their counters start at zero.
  .post("/", zValidator("json", CreateTopicInput), async (c) => {
    const userId = c.get("user").id
    const name = c.req.valid("json").name.trim()
    const [clash] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.userId, userId), eq(topics.name, name)))
      .limit(1)
    if (clash) {
      return c.json(
        { error: "A topic with that name already exists", code: "DUPLICATE" },
        409,
      )
    }
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    await db.insert(topics).values({
      id,
      userId,
      name,
      createdAt,
      updatedAt: createdAt,
    })
    return c.json(
      {
        topic: {
          id,
          name,
          sessionCount: 0,
          completedCount: 0,
          totalActualMs: 0,
          lastUsedAt: createdAt,
        },
      },
      201,
    )
  })
  // Rename a Topic by its stable id. The legacy text label is cascaded onto the
  // user's focus sessions + topic media so label-keyed lookups stay consistent.
  .patch("/:id", zValidator("json", RenameTopicInput), async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const name = c.req.valid("json").name.trim()
    if (!name) {
      return c.json({ error: "Invalid name", code: "BAD_REQUEST" }, 400)
    }
    const [topic] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.id, id), eq(topics.userId, userId)))
      .limit(1)
    if (!topic) {
      return c.json({ error: "Topic not found", code: "NOT_FOUND" }, 404)
    }
    const [clash] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.userId, userId), eq(topics.name, name)))
      .limit(1)
    if (clash && clash.id !== id) {
      return c.json(
        { error: "A topic with that name already exists", code: "CONFLICT" },
        409,
      )
    }
    const now = new Date().toISOString()
    await db
      .update(topics)
      .set({ name, updatedAt: now })
      .where(and(eq(topics.id, id), eq(topics.userId, userId)))
    await db
      .update(focusSessions)
      .set({ topic: name })
      .where(and(eq(focusSessions.userId, userId), eq(focusSessions.topicId, id)))
    await db
      .update(topicMedia)
      .set({ topic: name })
      .where(and(eq(topicMedia.userId, userId), eq(topicMedia.topicId, id)))
    return c.json({ topic: { id, name } })
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
  // ---- Vault items (notes + saved URLs), keyed by the topic id ----
  .get("/:id/vault", async (c) => {
    const userId = c.get("user").id
    const topicId = c.req.param("id")
    const items = await db
      .select({
        id: topicVaultItems.id,
        topicId: topicVaultItems.topicId,
        kind: topicVaultItems.kind,
        body: topicVaultItems.body,
        title: topicVaultItems.title,
        createdAt: topicVaultItems.createdAt,
      })
      .from(topicVaultItems)
      .where(
        and(
          eq(topicVaultItems.userId, userId),
          eq(topicVaultItems.topicId, topicId),
        ),
      )
      .orderBy(desc(topicVaultItems.createdAt))
      .limit(100)
    return c.json({ items })
  })
  .post("/:id/vault", zValidator("json", CreateVaultItemInput), async (c) => {
    const userId = c.get("user").id
    const topicId = c.req.param("id")
    const [topic] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.id, topicId), eq(topics.userId, userId)))
      .limit(1)
    if (!topic) {
      return c.json({ error: "Topic not found", code: "NOT_FOUND" }, 404)
    }
    const body = c.req.valid("json")
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    await db.insert(topicVaultItems).values({
      id,
      userId,
      topicId,
      kind: body.kind,
      body: body.body,
      title: body.title ?? null,
      createdAt,
    })
    return c.json(
      {
        item: {
          id,
          topicId,
          kind: body.kind,
          body: body.body,
          title: body.title ?? null,
          createdAt,
        },
      },
      201,
    )
  })
  .delete("/:id/vault/:itemId", async (c) => {
    const userId = c.get("user").id
    const itemId = c.req.param("itemId")
    await db
      .delete(topicVaultItems)
      .where(
        and(
          eq(topicVaultItems.id, itemId),
          eq(topicVaultItems.userId, userId),
        ),
      )
    return c.json({ ok: true })
  })
