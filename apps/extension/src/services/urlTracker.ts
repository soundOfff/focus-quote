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
import { emitDebug } from "../shared/debug"

const URL_BUFFER_KEY = "focusquote.urlBuffer"
const URL_SENT_KEY = "focusquote.urlSent"

/**
 * Buffer entry — same shape as wire-format NewSessionUrl. Stored locally
 * until the next flush. If the flush fails we keep the entries and retry
 * via SyncService's existing offline queue.
 */
const BufferEntry = NewSessionUrl
type BufferEntry = Schema.Schema.Type<typeof BufferEntry>

const Buffer = Schema.Array(BufferEntry)
type Buffer = Schema.Schema.Type<typeof Buffer>

/**
 * Dedupe ledger — the set of `sessionId|url` keys already recorded this
 * session, kept separately from the buffer because the buffer is wiped on
 * every flush (~30s). Without this, re-visiting a URL after a flush slipped
 * past the dedupe and got sent again, surfacing as duplicate rows in history.
 */
const SentEntry = Schema.Struct({
  key: Schema.String,
  hasContent: Schema.Boolean,
})
const SentLog = Schema.Array(SentEntry)
type SentLog = Schema.Schema.Type<typeof SentLog>

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

const readSent = (storage: StorageService): Effect.Effect<SentLog> =>
  Effect.gen(function* () {
    const raw = yield* storage
      .get<unknown>(URL_SENT_KEY)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))
    if (raw === null) return [] as unknown as SentLog
    return yield* Schema.decodeUnknown(SentLog)(raw).pipe(
      Effect.catchAll(() => Effect.succeed([] as unknown as SentLog)),
    )
  })

const writeSent = (storage: StorageService, log: SentLog) =>
  storage.set(URL_SENT_KEY, log).pipe(Effect.catchAll(() => Effect.void))

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
        content: string | null
      }) =>
        Effect.gen(function* () {
          const privacy = yield* loadPrivacy(storage).pipe(
            Effect.catchAll(() => Effect.succeed(defaultPrivacy)),
          )
          if (!privacy.trackUrls) {
            void emitDebug({
              type: "buffer:skip-privacy-off",
              hostname: input.hostname,
            })
            return
          }
          if (isBlocked(privacy, input.hostname)) {
            void emitDebug({
              type: "buffer:skip-blocklist",
              hostname: input.hostname,
            })
            return
          }

          const entry: BufferEntry = {
            id: crypto.randomUUID() as SessionUrlId,
            sessionId: input.sessionId as BufferEntry["sessionId"],
            url: input.url,
            hostname: input.hostname,
            title: input.title,
            content: input.content ? input.content.slice(0, 4000) : null,
            visitedAt: new Date().toISOString(),
          }
          const buf = yield* readBuffer(storage)
          // Dedupe against every URL already recorded for this session, not
          // just the current in-memory buffer. The buffer is wiped on each
          // flush (~30s), so a buffer-only check re-sent any URL re-visited
          // after a flush — those landed as duplicate rows in session history.
          // The sent ledger persists across flushes for the life of the session.
          const key = `${entry.sessionId}|${entry.url}`
          const hasContent = (entry.content?.length ?? 0) > 0
          const sent = yield* readSent(storage)
          const prior = sent.find((s) => s.key === key)
          // A content-bearing visit may still pass once, to upgrade an earlier
          // content-less capture so the AI gets the page text.
          if (prior && !(hasContent && !prior.hasContent)) {
            void emitDebug({
              type: "buffer:skip-dedupe",
              hostname: input.hostname,
            })
            return
          }
          yield* writeBuffer(storage, [...buf, entry])
          yield* writeSent(storage, [
            ...sent.filter((s) => s.key !== key),
            { key, hasContent },
          ].slice(-1000) as unknown as SentLog)
          void emitDebug({
            type: "buffer:add",
            hostname: input.hostname,
            title: input.title,
            bufferLen: buf.length + 1,
          })
        })

      /**
       * Flush all buffered URLs to the server. On failure, enqueue each
       * one onto the SyncService so the next sync drain retries them.
       */
      const flush = Effect.gen(function* () {
        const buf = yield* readBuffer(storage)
        if (buf.length === 0) {
          void emitDebug({ type: "flush:empty" })
          return { posted: 0, queued: 0 }
        }

        void emitDebug({ type: "flush:start", count: buf.length })
        const startedAt =
          typeof performance !== "undefined" ? performance.now() : Date.now()
        const result = yield* api
          .postSessionUrls({ urls: buf })
          .pipe(Effect.either)
        const ms = Math.round(
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) - startedAt,
        )

        if (result._tag === "Right") {
          yield* writeBuffer(storage, [] as unknown as Buffer)
          void emitDebug({
            type: "flush:posted",
            count: buf.length,
            ms,
          })
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
              content: entry.content,
              visitedAt: entry.visitedAt,
            })
            .pipe(Effect.catchAll(() => Effect.void))
        }
        yield* writeBuffer(storage, [] as unknown as Buffer)
        const reason =
          result.left instanceof Error ? result.left.message : String(result.left)
        void emitDebug({
          type: "flush:queued",
          count: buf.length,
          ms,
          reason: reason.slice(0, 120),
        })
        return { posted: 0, queued: buf.length }
      })

      const clear = Effect.gen(function* () {
        yield* writeBuffer(storage, [] as unknown as Buffer)
        yield* writeSent(storage, [] as unknown as SentLog)
      })

      return { record, flush, clear }
    }),
    dependencies: [
      StorageService.Default,
      ApiService.Default,
      SyncService.Default,
    ],
  },
) {}
