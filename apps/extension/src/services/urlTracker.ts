import { Effect, Schema } from "effect"
import { StorageService } from "./storage"
import { ApiService } from "./api"
import { SyncService } from "./sync"
import { NewSessionUrl, type SessionUrlId } from "@focus-quote/shared"
import {
  loadPrivacy,
  isBlocked,
  defaultPrivacy,
} from "../shared/privacy"

const URL_BUFFER_KEY = "focusquote.urlBuffer"

/**
 * Buffer entry — same shape as wire-format NewSessionUrl. Stored locally
 * until the next flush. If the flush fails we keep the entries and retry
 * via SyncService's existing offline queue.
 */
const BufferEntry = NewSessionUrl
type BufferEntry = Schema.Schema.Type<typeof BufferEntry>

const Buffer = Schema.Array(BufferEntry)
type Buffer = Schema.Schema.Type<typeof Buffer>

const readBuffer = (storage: StorageService): Effect.Effect<Buffer> =>
  Effect.gen(function* () {
    const raw = yield* storage
      .get<unknown>(URL_BUFFER_KEY)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))
    if (raw === null) return [] as unknown as Buffer
    return yield* Schema.decodeUnknown(Buffer)(raw).pipe(
      Effect.catchAll(() => Effect.succeed([] as unknown as Buffer)),
    )
  })

const writeBuffer = (storage: StorageService, buf: Buffer) =>
  storage.set(URL_BUFFER_KEY, buf).pipe(Effect.catchAll(() => Effect.void))

export class UrlTrackerService extends Effect.Service<UrlTrackerService>()(
  "UrlTrackerService",
  {
    effect: Effect.gen(function* () {
      const storage = yield* StorageService
      const api = yield* ApiService
      const sync = yield* SyncService

      /**
       * Record a URL visit. Caller is responsible for confirming an active
       * session exists; we re-check the privacy blocklist here to avoid
       * any chance of leaking data.
       */
      const record = (input: {
        sessionId: string
        url: string
        hostname: string
        title: string | null
      }) =>
        Effect.gen(function* () {
          const privacy = yield* loadPrivacy(storage).pipe(
            Effect.catchAll(() => Effect.succeed(defaultPrivacy)),
          )
          if (!privacy.trackUrls) return
          if (isBlocked(privacy, input.hostname)) return

          const entry: BufferEntry = {
            id: crypto.randomUUID() as SessionUrlId,
            sessionId: input.sessionId as BufferEntry["sessionId"],
            url: input.url,
            hostname: input.hostname,
            title: input.title,
            visitedAt: new Date().toISOString(),
          }
          const buf = yield* readBuffer(storage)
          // Dedupe: same session + url already buffered within last 10 min
          const cutoff = Date.now() - 10 * 60_000
          const isRecentDup = buf.some(
            (e) =>
              e.sessionId === entry.sessionId &&
              e.url === entry.url &&
              new Date(e.visitedAt).getTime() > cutoff,
          )
          if (isRecentDup) return
          yield* writeBuffer(storage, [...buf, entry])
        })

      /**
       * Flush all buffered URLs to the server. On failure, enqueue each
       * one onto the SyncService so the next sync drain retries them.
       */
      const flush = Effect.gen(function* () {
        const buf = yield* readBuffer(storage)
        if (buf.length === 0) return { posted: 0, queued: 0 }

        const result = yield* api
          .postSessionUrls({ urls: buf })
          .pipe(Effect.either)

        if (result._tag === "Right") {
          yield* writeBuffer(storage, [] as unknown as Buffer)
          return { posted: buf.length, queued: 0 }
        }

        // Online POST failed → queue each via offline sync, then clear buffer.
        for (const entry of buf) {
          yield* sync
            .enqueue({
              kind: "upsertSessionUrl",
              id: entry.id,
              sessionId: entry.sessionId,
              url: entry.url,
              hostname: entry.hostname,
              title: entry.title,
              visitedAt: entry.visitedAt,
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
