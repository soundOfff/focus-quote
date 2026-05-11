import { Effect } from "effect"
import { StorageService } from "./storage"
import { AUTH_TOKEN_KEY } from "../shared/auth-storage"
import type { SessionStreamEvent } from "@focus-quote/shared"

/**
 * Opens an SSE-like connection to /api/stream/session/:id using fetch +
 * ReadableStream so we can attach the Authorization header (EventSource
 * cannot). Re-broadcasts each event into the chrome.runtime so popup /
 * newtab listeners can react in real time.
 *
 * The connection auto-reconnects with exponential backoff on disconnect.
 * Callers get back a `close()` function that hard-stops the loop.
 */

const apiUrl = (path: string) =>
  `${__API_BASE_URL__.replace(/\/+$/, "")}${path}`

const broadcast = (sessionId: string, event: SessionStreamEvent) => {
  void chrome.runtime
    .sendMessage({
      type: "focusquote.stream.event",
      sessionId,
      event,
    })
    .catch(() => {
      /* no listener — popup may be closed */
    })
}

interface ActiveConnection {
  sessionId: string
  close: () => void
}

const state: { active: ActiveConnection | null } = { active: null }

export class RealtimeStreamService extends Effect.Service<RealtimeStreamService>()(
  "RealtimeStreamService",
  {
    effect: Effect.gen(function* () {
      const storage = yield* StorageService

      const open = (sessionId: string) =>
        Effect.gen(function* () {
          // If we're already connected to this session, leave it alone.
          const current = state.active
          if (current && current.sessionId === sessionId) return
          // Close any prior connection.
          if (current) current.close()

          const token = yield* storage
            .get<string>(AUTH_TOKEN_KEY)
            .pipe(Effect.catchAll(() => Effect.succeed(null)))
          if (!token) return

          const controller = new AbortController()
          let stopped = false
          const close = () => {
            stopped = true
            controller.abort()
            const cur = state.active
            if (cur && cur.sessionId === sessionId) state.active = null
          }
          state.active = { sessionId, close }

          // Run the read-loop detached; reconnect with backoff.
          void (async () => {
            let backoff = 1000
            while (!stopped) {
              try {
                const res = await fetch(
                  apiUrl(`/api/stream/session/${sessionId}`),
                  {
                    headers: {
                      Authorization: `Bearer ${token}`,
                      Accept: "text/event-stream",
                    },
                    signal: controller.signal,
                  },
                )
                if (!res.ok || !res.body) {
                  throw new Error(`stream ${res.status}`)
                }
                backoff = 1000

                const reader = res.body
                  .pipeThrough(new TextDecoderStream())
                  .getReader()
                let pending = ""
                while (!stopped) {
                  const { value, done } = await reader.read()
                  if (done) break
                  pending += value
                  let idx: number
                  while ((idx = pending.indexOf("\n\n")) !== -1) {
                    const block = pending.slice(0, idx)
                    pending = pending.slice(idx + 2)
                    parseAndDispatch(block, sessionId)
                  }
                }
              } catch (err) {
                if (stopped) return
                console.warn("[realtimeStream] disconnect, retrying:", err)
              }
              if (stopped) return
              await new Promise((r) => setTimeout(r, backoff))
              backoff = Math.min(backoff * 2, 30_000)
            }
          })()
        })

      const closeAll = Effect.sync(() => {
        const cur = state.active
        if (cur) {
          cur.close()
          state.active = null
        }
      })

      const isOpen = Effect.sync(() => state.active !== null)

      return { open, closeAll, isOpen }
    }),
    dependencies: [StorageService.Default],
  },
) {}

const parseAndDispatch = (block: string, sessionId: string) => {
  // SSE message format:
  //   id: 0
  //   event: classification
  //   data: { ... }
  const lines = block.split("\n")
  let data = ""
  for (const line of lines) {
    if (line.startsWith("data:")) {
      data += line.slice(5).trimStart() + "\n"
    }
  }
  if (!data) return
  try {
    const event = JSON.parse(data.trim()) as SessionStreamEvent
    if (event.type === "ping") return
    broadcast(sessionId, event)
  } catch (err) {
    console.warn("[realtimeStream] bad event:", err)
  }
}
