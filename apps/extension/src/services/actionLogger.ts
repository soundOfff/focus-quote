import { Effect, Schema } from "effect"
import { StorageService } from "./storage"
import { ApiService } from "./api"
import { SyncService } from "./sync"
import { NewSessionAction, type SessionActionId } from "@focus-quote/shared"

const ACTION_BUFFER_KEY = "focusquote.actionBuffer"

const BufferEntry = NewSessionAction
type BufferEntry = Schema.Schema.Type<typeof BufferEntry>

const Buffer = Schema.Array(BufferEntry)
type Buffer = Schema.Schema.Type<typeof Buffer>

const readBuffer = (storage: StorageService): Effect.Effect<Buffer> =>
  Effect.gen(function* () {
    const raw = yield* storage
      .get<unknown>(ACTION_BUFFER_KEY)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))
    if (raw === null) return [] as unknown as Buffer
    return yield* Schema.decodeUnknown(Buffer)(raw).pipe(
      Effect.catchAll(() => Effect.succeed([] as unknown as Buffer)),
    )
  })

const writeBuffer = (storage: StorageService, buf: Buffer) =>
  storage.set(ACTION_BUFFER_KEY, buf).pipe(Effect.catchAll(() => Effect.void))

export class ActionLoggerService extends Effect.Service<ActionLoggerService>()(
  "ActionLoggerService",
  {
    effect: Effect.gen(function* () {
      const storage = yield* StorageService
      const api = yield* ApiService
      const sync = yield* SyncService

      const record = (input: {
        sessionId: string
        actionKind: "click" | "focus" | "blur" | "submit" | "scroll" | "nav"
        payload: string
        at?: string
      }) =>
        Effect.gen(function* () {
          const entry: BufferEntry = {
            id: crypto.randomUUID() as SessionActionId,
            sessionId: input.sessionId as BufferEntry["sessionId"],
            kind: input.actionKind,
            payload: input.payload.slice(0, 4000),
            at: input.at ?? new Date().toISOString(),
          }
          const buf = yield* readBuffer(storage)
          const last = buf[buf.length - 1]
          const isDuplicate =
            !!last &&
            last.sessionId === entry.sessionId &&
            last.kind === entry.kind &&
            last.payload === entry.payload
          if (isDuplicate) return
          const next = [...buf, entry].slice(-500)
          yield* writeBuffer(storage, next)
        })

      const flush = Effect.gen(function* () {
        const buf = yield* readBuffer(storage)
        if (buf.length === 0) return { posted: 0, queued: 0 }

        const result = yield* api
          .postSessionActions({ actions: buf })
          .pipe(Effect.either)

        if (result._tag === "Right") {
          yield* writeBuffer(storage, [] as unknown as Buffer)
          return { posted: buf.length, queued: 0 }
        }

        for (const entry of buf) {
          yield* sync
            .enqueue({
              kind: "upsertSessionAction",
              id: entry.id,
              sessionId: entry.sessionId,
              actionKind: entry.kind,
              payload: entry.payload,
              at: entry.at,
            })
            .pipe(Effect.catchAll(() => Effect.void))
        }
        yield* writeBuffer(storage, [] as unknown as Buffer)
        return { posted: 0, queued: buf.length }
      })

      const clear = writeBuffer(storage, [] as unknown as Buffer)

      return { record, flush, clear }
    }),
    dependencies: [
      StorageService.Default,
      ApiService.Default,
      SyncService.Default,
    ],
  },
) {}
