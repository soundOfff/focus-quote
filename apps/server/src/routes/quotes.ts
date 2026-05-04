import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq, like, or, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { quotes } from "../db/schema"
import { requireUser, type RequireUserVariables } from "../middleware/require-user"
import { ListQuotesQuery, NewQuoteInput } from "../lib/api-schemas"

export const quotesRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/", zValidator("query", ListQuotesQuery), async (c) => {
    const userId = c.get("user").id
    const { limit = 50, q } = c.req.valid("query")
    const filters = q
      ? and(
          eq(quotes.userId, userId),
          or(like(quotes.text, `%${q}%`), like(quotes.tag, `%${q}%`)),
        )
      : eq(quotes.userId, userId)
    const rows = await db
      .select()
      .from(quotes)
      .where(filters)
      .orderBy(desc(quotes.createdAt))
      .limit(limit)
    return c.json({ quotes: rows.map(toQuoteDTO) })
  })
  .post("/", zValidator("json", NewQuoteInput), async (c) => {
    const userId = c.get("user").id
    const body = c.req.valid("json")
    const id = randomUUID()
    const now = new Date().toISOString()
    await db.insert(quotes).values({
      id,
      userId,
      text: body.text,
      sourceUrl: body.sourceUrl,
      sourceTitle: body.sourceTitle,
      tag: body.tag,
      createdAt: now,
      updatedAt: now,
    })
    const [row] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1)
    if (!row) return c.json({ error: "Insert failed" }, 500)
    return c.json({ quote: toQuoteDTO(row) }, 201)
  })
  .delete("/:id", async (c) => {
    const userId = c.get("user").id
    const id = c.req.param("id")
    const result = await db
      .delete(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.userId, userId)))
    // libSQL/drizzle returns rowsAffected on the result
    const rowsAffected = (result as unknown as { rowsAffected?: number })
      .rowsAffected ?? 0
    if (rowsAffected === 0) return c.json({ error: "Not found" }, 404)
    return c.json({ ok: true as const })
  })

const toQuoteDTO = (row: typeof quotes.$inferSelect) => ({
  id: row.id,
  text: row.text,
  sourceUrl: row.sourceUrl,
  sourceTitle: row.sourceTitle,
  tag: row.tag,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

// silence unused warning when sql helper isn't needed elsewhere
void sql
