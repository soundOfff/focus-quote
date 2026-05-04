import { Effect, Schema } from "effect"
import { StorageService } from "./storage"
import { ApiService } from "./api"
import { SyncJob } from "@focus-quote/shared"
import { SyncError } from "../shared/errors"

const QUEUE_KEY = "focusquote.syncQueue"

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
        let applied = 0
        const results = result.right.results
        for (let i = 0; i < queue.length; i++) {
          const item = queue[i]!
          const r = results[i]
          if (r?.ok) {
            applied++
          } else {
            remaining.push({ ...item, attempts: item.attempts + 1 })
          }
        }
        yield* writeQueue(remaining)
        return { applied, failed: remaining.length }
      }).pipe(
        Effect.mapError(
          (cause) => new SyncError({ message: "drain failed", cause }),
        ),
      )

      const queueSize: Effect.Effect<number, SyncError> = readQueue.pipe(
        Effect.map((q) => q.length),
        Effect.mapError(
          (cause) => new SyncError({ message: "queue read failed", cause }),
        ),
      )

      return { enqueue, drain, queueSize }
    }),
    dependencies: [StorageService.Default, ApiService.Default],
  },
) {}
