import { Effect, Schema } from "effect"
import { StorageService } from "./storage"
import { ApiService } from "./api"
import { SyncJob, type Quote } from "@focus-quote/shared"
import { SyncError } from "../shared/errors"
import { AUTH_TOKEN_KEY } from "../shared/auth-storage"

const QUEUE_KEY = "focusquote.syncQueue"
// Kept in sync with quotes.ts; SyncService can't import QuotesService
// without creating a dependency cycle.
const QUOTES_KEY = "focusquote.quotes"

const QueuedJob = Schema.Struct({
  id: Schema.String,
  job: SyncJob,
  attempts: Schema.Number,
  enqueuedAt: Schema.String,
})
type QueuedJob = Schema.Schema.Type<typeof QueuedJob>

const Queue = Schema.Array(QueuedJob)

export class SyncService extends Effect.Service<SyncService>()(
  "SyncService",
  {
    effect: Effect.gen(function* () {
      const storage = yield* StorageService
      const api = yield* ApiService

      const readQueue = Effect.gen(function* () {
        const raw = yield* storage.get<unknown>(QUEUE_KEY)
        if (raw === null) return [] as ReadonlyArray<QueuedJob>
        return yield* Schema.decodeUnknown(Queue)(raw).pipe(
          Effect.catchAll(() =>
            Effect.succeed([] as ReadonlyArray<QueuedJob>),
          ),
        )
      })

      const writeQueue = (q: ReadonlyArray<QueuedJob>) =>
        storage.set(QUEUE_KEY, q)

      const removeLocalQuotes = (ids: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          if (ids.length === 0) return
          const raw = yield* storage.get<Record<string, unknown>>(QUOTES_KEY)
          if (raw === null || typeof raw !== "object") return
          const drop = new Set(ids)
          const next: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(raw)) {
            if (!drop.has(k)) next[k] = v
          }
          yield* storage.set(QUOTES_KEY, next)
        })

      const enqueue = (job: SyncJob): Effect.Effect<void, SyncError> =>
        Effect.gen(function* () {
          const queue = yield* readQueue
          const queued: QueuedJob = {
            id: crypto.randomUUID(),
            job,
            attempts: 0,
            enqueuedAt: new Date().toISOString(),
          }
          yield* writeQueue([...queue, queued])
        }).pipe(
          Effect.mapError(
            (cause) => new SyncError({ message: "enqueue failed", cause }),
          ),
        )

      const drain: Effect.Effect<
        { applied: number; failed: number },
        SyncError
      > = Effect.gen(function* () {
        const queue = yield* readQueue
        if (queue.length === 0) return { applied: 0, failed: 0 }

        // Guest mode: with no auth token, every request would 401. Leave the
        // queue intact and noop; the next sign-in kicks drain explicitly so
        // guest writes migrate to the new account.
        const token = yield* storage
          .get<string>(AUTH_TOKEN_KEY)
          .pipe(Effect.catchAll(() => Effect.succeed(null)))
        if (!token) return { applied: 0, failed: 0 }

        // Send the entire queue in one round trip; server returns
        // a per-item ok/error tuple.
        const result = yield* api
          .syncBatch({ jobs: queue.map((it) => it.job) })
          .pipe(Effect.either)

        if (result._tag === "Left") {
          // Whole batch failed (network down or signed out) — retry next tick.
          return { applied: 0, failed: queue.length }
        }

        const remaining: QueuedJob[] = []
        const dedupedQuoteIds: string[] = []
        let applied = 0
        const results = result.right.results
        for (let i = 0; i < queue.length; i++) {
          const item = queue[i]!
          const r = results[i]
          if (r?.ok) {
            applied++
            if (r.deduped && item.job.kind === "upsertQuote") {
              dedupedQuoteIds.push(item.job.id)
            }
          } else {
            remaining.push({ ...item, attempts: item.attempts + 1 })
          }
        }
        yield* writeQueue(remaining)
        if (dedupedQuoteIds.length > 0) {
          yield* removeLocalQuotes(dedupedQuoteIds).pipe(Effect.either)
        }
        return { applied, failed: remaining.length }
      }).pipe(
        Effect.mapError(
          (cause) => new SyncError({ message: "drain failed", cause }),
        ),
      )

      // Pull server quotes down into local storage. Sync is otherwise
      // push-only (drain), so without this a fresh profile — or one whose
      // local storage was cleared — never sees quotes captured on other
      // devices. Union merge: server-only quotes are added, local-only quotes
      // (e.g. captured offline and still queued) are kept, and on id overlap
      // the record with the newer updatedAt wins.
      const pull: Effect.Effect<{ pulled: number }, SyncError> = Effect.gen(
        function* () {
          const token = yield* storage
            .get<string>(AUTH_TOKEN_KEY)
            .pipe(Effect.catchAll(() => Effect.succeed(null)))
          if (!token) return { pulled: 0 }

          // limit 200 is the server's max; covers any realistic local total.
          const res = yield* api.listQuotes({ limit: 200 })
          const raw = yield* storage
            .get<Record<string, Quote>>(QUOTES_KEY)
            .pipe(Effect.catchAll(() => Effect.succeed(null)))
          const local =
            raw && typeof raw === "object" ? raw : ({} as Record<string, Quote>)

          const next: Record<string, Quote> = { ...local }
          let pulled = 0
          for (const q of res.quotes) {
            const existing = next[q.id]
            if (!existing) {
              next[q.id] = q
              pulled++
            } else if (q.updatedAt > existing.updatedAt) {
              next[q.id] = q
            }
          }
          if (pulled > 0) yield* storage.set(QUOTES_KEY, next)
          return { pulled }
        },
      ).pipe(
        Effect.mapError(
          (cause) => new SyncError({ message: "pull failed", cause }),
        ),
      )

      const queueSize: Effect.Effect<number, SyncError> = readQueue.pipe(
        Effect.map((q) => q.length),
        Effect.mapError(
          (cause) => new SyncError({ message: "queue read failed", cause }),
        ),
      )

      return { enqueue, drain, pull, queueSize }
    }),
    dependencies: [StorageService.Default, ApiService.Default],
  },
) {}
