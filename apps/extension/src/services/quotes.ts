import { Effect, Schema } from "effect"
import { StorageService } from "./storage"
import { SyncService } from "./sync"
import { Quote, NewQuote, type QuoteId } from "@focus-quote/shared"
import { ValidationError } from "../shared/errors"

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
        return yield* Schema.decodeUnknown(QuoteRecord)(raw).pipe(
          Effect.catchAll(() => Effect.succeed({} as QuoteRecord)),
        )
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
          const now = new Date().toISOString()
          const quote: Quote = {
            id: crypto.randomUUID() as QuoteId,
            text: validated.text,
            sourceUrl: validated.sourceUrl,
            sourceTitle: validated.sourceTitle,
            tag: validated.tag,
            createdAt: now,
            updatedAt: now,
          }
          const all = yield* readAll
          yield* writeAll({ ...all, [quote.id]: quote })
          yield* sync.enqueue({
            kind: "upsertQuote",
            id: quote.id,
            text: quote.text,
            sourceUrl: quote.sourceUrl,
            sourceTitle: quote.sourceTitle,
            tag: quote.tag,
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
