import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq, like, sql } from "drizzle-orm"
import { createHash, randomUUID } from "node:crypto"
import { db } from "../db/client"
import { quotes } from "../db/schema"
import { requireUser, type RequireUserVariables } from "../middleware/require-user"
import { ListQuotesQuery, NewQuoteInput } from "../lib/api-schemas"

const hashQuoteText = (text: string): string =>
  createHash("sha256").update(text.trim()).digest("hex")

const isUniqueConstraintViolation = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false
  const e = err as { code?: unknown; message?: unknown }
  const msg =
    typeof e.message === "string" ? e.message : String((err as Error).message ?? "")
  return (
    e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    e.code === "SQLITE_CONSTRAINT" ||
    msg.includes("UNIQUE constraint failed") ||
    msg.includes("quotes_user_content_hash_uq")
  )
}

export const quotesRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/", zValidator("query", ListQuotesQuery), async (c) => {
    const userId = c.get("user").id
    const { limit = 50, q } = c.req.valid("query")
    const filters = q
      ? and(eq(quotes.userId, userId), like(quotes.text, `%${q}%`))
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
    const contentHash = hashQuoteText(body.text)
    try {
      await db.insert(quotes).values({
        id,
        userId,
        text: body.text,
        sourceUrl: body.sourceUrl,
        sourceTitle: body.sourceTitle,
        contentHash,
        createdAt: now,
        updatedAt: now,
      })
    } catch (err) {
      if (!isUniqueConstraintViolation(err)) throw err
      const [existing] = await db
        .select()
        .from(quotes)
        .where(and(eq(quotes.userId, userId), eq(quotes.contentHash, contentHash)))
        .limit(1)
      if (!existing) return c.json({ error: "Duplicate detected but row missing" }, 500)
      return c.json({ quote: toQuoteDTO(existing), deduped: true as const })
    }
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
  categorizationStatus: row.categorizationStatus,
  // Backfilled by migrate.ts; fall back to a fresh hash if a row somehow
  // slipped through (shouldn't happen in practice, but keeps the wire type honest).
  contentHash: row.contentHash ?? hashQuoteText(row.text),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

// silence unused warning when sql helper isn't needed elsewhere
void sql
