import { Effect, Schema } from "effect"
import { StorageService } from "./storage"
import { SyncService } from "./sync"
import {
  Session,
  NewSession,
  type DeviceId,
  type SessionId,
} from "../shared/schema"
import { ValidationError } from "../shared/errors"

const SESSIONS_KEY = "focusquote.sessions"
const ACTIVE_SESSION_KEY = "focusquote.activeSession"

const SessionRecord = Schema.Record({ key: Schema.String, value: Session })
type SessionRecord = Schema.Schema.Type<typeof SessionRecord>

const ActiveSession = Schema.Struct({
  sessionId: Schema.String,
  goal: Schema.NullOr(Schema.String),
  durationMinutes: Schema.Number,
  breakMinutes: Schema.Number,
  startedAt: Schema.String,
  expectedEndAt: Schema.String,
  deviceId: Schema.String,
})
export type ActiveSession = Schema.Schema.Type<typeof ActiveSession>

export interface SessionStats {
  todayCount: number
  streakDays: number
  totalCompleted: number
}

export class SessionsService extends Effect.Service<SessionsService>()(
  "SessionsService",
  {
    effect: Effect.gen(function* () {
      const storage = yield* StorageService
      const sync = yield* SyncService

      const readAll = Effect.gen(function* () {
        const raw = yield* storage.get<unknown>(SESSIONS_KEY)
        if (raw === null) return {} as SessionRecord
        return yield* Schema.decodeUnknown(SessionRecord)(raw).pipe(
          Effect.catchAll(() => Effect.succeed({} as SessionRecord)),
        )
      })

      const writeAll = (record: SessionRecord) =>
        storage.set(SESSIONS_KEY, record)

      const list = (limit?: number) =>
        Effect.gen(function* () {
          const all = yield* readAll
          const arr = Object.values(all).sort((a, b) =>
            b.startedAt.localeCompare(a.startedAt),
          )
          return limit ? arr.slice(0, limit) : arr
        })

      const start = (input: NewSession, deviceId: DeviceId) =>
        Effect.gen(function* () {
          const validated = yield* Schema.decodeUnknown(NewSession)(input).pipe(
            Effect.mapError(
              (e) =>
                new ValidationError({ message: "invalid session", cause: e }),
            ),
          )
          const now = new Date()
          const expectedEnd = new Date(
            now.getTime() + validated.durationMinutes * 60_000,
          )
          const session: Session = {
            id: crypto.randomUUID() as SessionId,
            deviceId,
            goal: validated.goal,
            durationMinutes: validated.durationMinutes,
            breakMinutes: validated.breakMinutes,
            completed: false,
            startedAt: now.toISOString(),
            endedAt: null,
          }
          const all = yield* readAll
          yield* writeAll({ ...all, [session.id]: session })
          const active: ActiveSession = {
            sessionId: session.id,
            goal: session.goal,
            durationMinutes: session.durationMinutes,
            breakMinutes: session.breakMinutes,
            startedAt: session.startedAt,
            expectedEndAt: expectedEnd.toISOString(),
            deviceId,
          }
          yield* storage.set(ACTIVE_SESSION_KEY, active)
          yield* sync.enqueue({ kind: "upsertSession", session })
          return { session, active }
        })

      const complete = (id: SessionId, completed: boolean) =>
        Effect.gen(function* () {
          const all = yield* readAll
          const existing = all[id]
          if (!existing) return null
          const updated: Session = {
            ...existing,
            completed,
            endedAt: new Date().toISOString(),
          }
          yield* writeAll({ ...all, [id]: updated })
          yield* storage.remove(ACTIVE_SESSION_KEY)
          yield* sync.enqueue({ kind: "upsertSession", session: updated })
          return updated
        })

      const cancel = Effect.gen(function* () {
        const active = yield* storage.get<ActiveSession>(ACTIVE_SESSION_KEY)
        if (!active) return null
        return yield* complete(active.sessionId as SessionId, false)
      })

      const getActive = storage.get<ActiveSession>(ACTIVE_SESSION_KEY)

      const stats: Effect.Effect<SessionStats, never> = Effect.gen(
        function* () {
          const all = yield* readAll.pipe(
            Effect.catchAll(() => Effect.succeed({} as SessionRecord)),
          )
          const completed = Object.values(all).filter((s) => s.completed)
          const today = new Date().toISOString().slice(0, 10)
          const todayCount = completed.filter(
            (s) => s.startedAt.slice(0, 10) === today,
          ).length

          const days = new Set(
            completed.map((s) => s.startedAt.slice(0, 10)),
          )
          let streak = 0
          const cur = new Date()
          while (days.has(cur.toISOString().slice(0, 10))) {
            streak++
            cur.setDate(cur.getDate() - 1)
          }

          return {
            todayCount,
            streakDays: streak,
            totalCompleted: completed.length,
          }
        },
      )

      return { list, start, complete, cancel, getActive, stats }
    }),
    dependencies: [StorageService.Default, SyncService.Default],
  },
) {}
