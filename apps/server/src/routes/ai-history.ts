import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, asc, desc, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { aiChatMessages, aiChatThreads } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import {
  AppendAiMessageInput,
  CreateAiThreadInput,
  ListAiThreadsQuery,
} from "../lib/api-schemas"

type ThreadRow = typeof aiChatThreads.$inferSelect
type MessageRow = typeof aiChatMessages.$inferSelect

const toThreadDTO = (row: ThreadRow) => ({
  id: row.id,
  kind: row.kind as "quote_assistant" | "guide_me",
  passage: row.passage,
  sourceUrl: row.sourceUrl,
  goal: row.goal,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const toMessageDTO = (row: MessageRow) => ({
  id: row.id,
  threadId: row.threadId,
  role: row.role as "user" | "assistant",
  content: row.content,
  createdAt: row.createdAt,
})

const findOwnedThread = async (
  userId: string,
  id: string,
): Promise<ThreadRow | null> => {
  const [row] = await db
    .select()
    .from(aiChatThreads)
    .where(and(eq(aiChatThreads.id, id), eq(aiChatThreads.userId, userId)))
    .limit(1)
  return row ?? null
}

export const aiHistoryRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/threads", zValidator("query", ListAiThreadsQuery), async (c) => {
    const userId = c.get("user").id
    const { kind, limit = 25 } = c.req.valid("query")
    const conditions = [eq(aiChatThreads.userId, userId)]
    if (kind) conditions.push(eq(aiChatThreads.kind, kind))
    const rows = await db
      .select()
      .from(aiChatThreads)
      .where(and(...conditions))
      .orderBy(desc(aiChatThreads.updatedAt))
      .limit(limit)
    return c.json({ threads: rows.map(toThreadDTO) })
  })
  .post("/threads", zValidator("json", CreateAiThreadInput), async (c) => {
    const userId = c.get("user").id
    const body = c.req.valid("json")
    const id = body.id ?? randomUUID()
    const now = new Date().toISOString()
    await db
      .insert(aiChatThreads)
      .values({
        id,
        userId,
        kind: body.kind,
        passage: body.passage ?? null,
        sourceUrl: body.sourceUrl ?? null,
        goal: body.goal ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: aiChatThreads.id })
    const row = await findOwnedThread(userId, id)
    if (!row) return c.json({ error: "Thread upsert failed" }, 500)
    return c.json({ thread: toThreadDTO(row) }, 201)
  })
  .get("/threads/:id/messages", async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const owned = await findOwnedThread(userId, id)
    if (!owned) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    const rows = await db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.threadId, id))
      .orderBy(asc(aiChatMessages.createdAt))
      .limit(500)
    return c.json({ messages: rows.map(toMessageDTO) })
  })
  .post(
    "/threads/:id/messages",
    zValidator("json", AppendAiMessageInput),
    async (c) => {
      const userId = c.get("user").id
      const id = c.req.param("id")
      const body = c.req.valid("json")
      const owned = await findOwnedThread(userId, id)
      if (!owned) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
      const messageId = randomUUID()
      const now = new Date().toISOString()
      await db.insert(aiChatMessages).values({
        id: messageId,
        threadId: id,
        userId,
        role: body.role,
        content: body.content,
        createdAt: now,
      })
      await db
        .update(aiChatThreads)
        .set({ updatedAt: now })
        .where(eq(aiChatThreads.id, id))
      const [row] = await db
        .select()
        .from(aiChatMessages)
        .where(eq(aiChatMessages.id, messageId))
        .limit(1)
      if (!row) return c.json({ error: "Insert failed" }, 500)
      return c.json({ message: toMessageDTO(row) }, 201)
    },
  )
