import { Effect, Schema } from "effect"
import { StorageService } from "./storage"
import { SyncService } from "./sync"
import {
  Quote,
  NewQuote,
  quoteContentHash,
  type QuoteId,
} from "@focus-quote/shared"
import { DuplicateQuoteError, ValidationError } from "../shared/errors"

const QUOTES_KEY = "focusquote.quotes"

const QuoteRecord = Schema.Record({ key: Schema.String, value: Quote })
type QuoteRecord = Schema.Schema.Type<typeof QuoteRecord>

export class QuotesService extends Effect.Service<QuotesService>()(
  "QuotesService",
  {
    effect: Effect.gen(function* () {
      const storage = yield* StorageService
      const sync = yield* SyncService

      const readAll = Effect.gen(function* () {
        const raw = yield* storage.get<unknown>(QUOTES_KEY)
        if (raw === null) return {} as QuoteRecord
        const decoded = yield* Schema.decodeUnknown(QuoteRecord)(raw).pipe(
          Effect.catchAll(() => Effect.succeed(null as QuoteRecord | null)),
        )
        if (decoded !== null) return decoded
        // Pre-#5 records lack `contentHash`. Lazy-backfill any missing hashes
        // so the local dedup check has something to compare against.
        const rawRecord = (raw as Record<string, Record<string, unknown>>) ?? {}
        const updated: Record<string, Quote> = {}
        let added = false
        let skipped = false
        for (const [id, entry] of Object.entries(rawRecord)) {
          const text = typeof entry?.text === "string" ? entry.text : ""
          if (!text) {
            skipped = true
            continue
          }
          const hash = yield* Effect.tryPromise({
            try: () => quoteContentHash(text),
            catch: () => null,
          }).pipe(Effect.catchAll(() => Effect.succeed(null as string | null)))
          if (!hash) {
            skipped = true
            continue
          }
          const hadValidHash =
            typeof entry.contentHash === "string" && entry.contentHash.length === 64
          updated[id] = {
            id: id as QuoteId,
            text,
            sourceUrl: (entry.sourceUrl as string | null) ?? null,
            sourceTitle: (entry.sourceTitle as string | null) ?? null,
            tag: (entry.tag as string | null) ?? null,
            contentHash: hadValidHash ? (entry.contentHash as string) : hash,
            createdAt:
              typeof entry.createdAt === "string"
                ? entry.createdAt
                : new Date().toISOString(),
            updatedAt:
              typeof entry.updatedAt === "string"
                ? entry.updatedAt
                : new Date().toISOString(),
          }
          if (!hadValidHash) added = true
        }
        // Only persist if we strictly *added* missing hashes and lost nothing.
        // Skipped entries (empty text or transient hash failure) are left
        // untouched in storage so a future read can retry them.
        if (added && !skipped) yield* storage.set(QUOTES_KEY, updated)
        return updated as QuoteRecord
      })

      const writeAll = (record: QuoteRecord) => storage.set(QUOTES_KEY, record)

      const list = (limit?: number) =>
        Effect.gen(function* () {
          const all = yield* readAll
          const arr = Object.values(all).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          )
          return limit ? arr.slice(0, limit) : arr
        })

      const search = (query: string) =>
        Effect.gen(function* () {
          const all = yield* list()
          const q = query.toLowerCase().trim()
          if (!q) return all
          return all.filter(
            (it) =>
              it.text.toLowerCase().includes(q) ||
              (it.tag?.toLowerCase().includes(q) ?? false),
          )
        })

      const save = (input: NewQuote) =>
        Effect.gen(function* () {
          const validated = yield* Schema.decodeUnknown(NewQuote)(input).pipe(
            Effect.mapError(
              (e) =>
                new ValidationError({ message: "invalid quote", cause: e }),
            ),
          )
          const contentHash = yield* Effect.tryPromise({
            try: () => quoteContentHash(validated.text),
            catch: (cause) =>
              new ValidationError({ message: "hash failed", cause }),
          })
          const all = yield* readAll
          const existing = Object.values(all).find(
            (q) => q.contentHash === contentHash,
          )
          if (existing) {
            return yield* Effect.fail(
              new DuplicateQuoteError({
                existingId: existing.id,
                contentHash,
              }),
            )
          }
          const now = new Date().toISOString()
          const quote: Quote = {
            id: crypto.randomUUID() as QuoteId,
            text: validated.text,
            sourceUrl: validated.sourceUrl,
            sourceTitle: validated.sourceTitle,
            tag: validated.tag,
            contentHash,
            createdAt: now,
            updatedAt: now,
          }
          yield* writeAll({ ...all, [quote.id]: quote })
          yield* sync.enqueue({
            kind: "upsertQuote",
            id: quote.id,
            text: quote.text,
            sourceUrl: quote.sourceUrl,
            sourceTitle: quote.sourceTitle,
            tag: quote.tag,
            contentHash: quote.contentHash,
            createdAt: quote.createdAt,
            updatedAt: quote.updatedAt,
          })
          return quote
        })

      const remove = (id: QuoteId) =>
        Effect.gen(function* () {
          const all = yield* readAll
          if (!(id in all)) return
          const next = Object.fromEntries(
            Object.entries(all).filter(([k]) => k !== id),
          ) as QuoteRecord
          yield* writeAll(next)
          yield* sync.enqueue({ kind: "deleteQuote", id })
        })

      return { list, search, save, remove }
    }),
    dependencies: [StorageService.Default, SyncService.Default],
  },
) {}
