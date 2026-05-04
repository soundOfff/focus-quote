import { Effect, Schema } from "effect"
import { DatabaseService } from "./database"
import { StorageService } from "./storage"
import { SyncJob, type Quote, type Session } from "@focus-quote/shared"
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

const upsertQuoteSql = `INSERT INTO quotes (id, device_id, text, source_url, source_title, tag, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  text = excluded.text,
  source_url = excluded.source_url,
  source_title = excluded.source_title,
  tag = excluded.tag,
  updated_at = excluded.updated_at`

const upsertSessionSql = `INSERT INTO sessions (id, device_id, goal, duration_minutes, break_minutes, completed, started_at, ended_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  goal = excluded.goal,
  duration_minutes = excluded.duration_minutes,
  break_minutes = excluded.break_minutes,
  completed = excluded.completed,
  ended_at = excluded.ended_at`

const quoteRow = (q: Quote) => [
  q.id,
  q.deviceId,
  q.text,
  q.sourceUrl,
  q.sourceTitle,
  q.tag,
  q.createdAt,
  q.updatedAt,
]

const sessionRow = (s: Session) => [
  s.id,
  s.deviceId,
  s.goal,
  s.durationMinutes,
  s.breakMinutes,
  s.completed ? 1 : 0,
  s.startedAt,
  s.endedAt,
]

export class SyncService extends Effect.Service<SyncService>()(
  "SyncService",
  {
    effect: Effect.gen(function* () {
      const storage = yield* StorageService
      const db = yield* DatabaseService

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

      const applyJob = (job: SyncJob) => {
        switch (job.kind) {
          case "upsertQuote":
            return db.execute(upsertQuoteSql, quoteRow(job.quote))
          case "deleteQuote":
            return db.execute(
              "DELETE FROM quotes WHERE id = ? AND device_id = ?",
              [job.id, job.deviceId],
            )
          case "upsertSession":
            return db.execute(upsertSessionSql, sessionRow(job.session))
        }
      }

      const drain: Effect.Effect<
        { applied: number; failed: number },
        SyncError
      > = Effect.gen(function* () {
        if (!db.isReady()) return { applied: 0, failed: 0 }
        const queue = yield* readQueue
        if (queue.length === 0) return { applied: 0, failed: 0 }

        const remaining: QueuedJob[] = []
        let applied = 0
        for (const item of queue) {
          const result = yield* applyJob(item.job).pipe(Effect.either)
          if (result._tag === "Right") {
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
    dependencies: [StorageService.Default, DatabaseService.Default],
  },
) {}
