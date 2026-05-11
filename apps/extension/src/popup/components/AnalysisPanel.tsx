import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import { AlertCircle, Globe } from "lucide-preact"
import { SessionsService, type ActiveSession } from "../../services/sessions"
import { ApiService } from "../../services/api"
import { runP } from "../runtime"
import type {
  SessionStreamEvent,
  SessionUrl,
} from "@focus-quote/shared"

interface UrlRow {
  id: string
  url: string
  hostname: string
  title: string | null
  category: string | null
  distractionScore: number | null
}

interface Nudge {
  sessionUrlId: string
  message: string
  receivedAt: number
}

const loadActiveAndUrls = Effect.gen(function* () {
  const sessions = yield* SessionsService
  const api = yield* ApiService
  const active: ActiveSession | null = yield* sessions.getActive.pipe(
    Effect.orElseSucceed(() => null),
  )
  if (!active) return { active: null, urls: [] as UrlRow[] }
  const res = yield* api
    .getSessionUrls(active.sessionId)
    .pipe(Effect.catchAll(() => Effect.succeed({ urls: [] as SessionUrl[] })))
  const urls: UrlRow[] = res.urls.map((u) => ({
    id: u.id,
    url: u.url,
    hostname: u.hostname,
    title: u.title,
    category: u.category,
    distractionScore: u.distractionScore,
  }))
  return { active, urls }
})

const categoryColor = (c: string | null): string => {
  const v = (c ?? "").toLowerCase()
  if (v.includes("work") || v.includes("research") || v.includes("tools"))
    return "text-emerald-500"
  if (v.includes("social") || v.includes("entertainment"))
    return "text-rose-500"
  if (v.includes("news") || v.includes("shopping")) return "text-amber-500"
  return "opacity-60"
}

export function AnalysisPanel() {
  const [active, setActive] = useState<ActiveSession | null>(null)
  const [urls, setUrls] = useState<UrlRow[]>([])
  const [nudges, setNudges] = useState<Nudge[]>([])

  const refresh = () =>
    runP(loadActiveAndUrls)
      .then(({ active: a, urls: u }) => {
        setActive(a)
        setUrls(u)
      })
      .catch(() => {
        /* signed out or other transient — ignore */
      })

  useEffect(() => {
    refresh()
    const poll = setInterval(refresh, 8000)
    return () => clearInterval(poll)
  }, [])

  useEffect(() => {
    const onMessage = (msg: unknown) => {
      if (
        typeof msg !== "object" ||
        msg === null ||
        (msg as { type?: string }).type !== "focusquote.stream.event"
      ) {
        return
      }
      const event = (msg as { event: SessionStreamEvent }).event
      if (event.type === "classification") {
        setUrls((prev) =>
          prev.map((u) =>
            u.id === event.sessionUrlId
              ? {
                  ...u,
                  category: event.category,
                  distractionScore: event.distractionScore,
                }
              : u,
          ),
        )
      } else if (event.type === "nudge") {
        setNudges((prev) => [
          {
            sessionUrlId: event.sessionUrlId,
            message: event.message,
            receivedAt: Date.now(),
          },
          ...prev,
        ].slice(0, 5))
        // Re-fetch to pick up the new URL row if it's not in state yet.
        refresh()
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [])

  if (!active) return null

  return (
    <div class="rounded bg-card-light p-3 shadow-sm dark:bg-card-dark dark:shadow-none">
      <div class="mb-2 flex items-center gap-2 text-xs font-medium opacity-80">
        <Globe size={12} class="text-accent" />
        Session analysis
      </div>

      {nudges.length > 0 && (
        <div class="mb-3 space-y-1.5">
          {nudges.map((n) => (
            <div
              key={`${n.sessionUrlId}-${n.receivedAt}`}
              class="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs"
            >
              <AlertCircle size={12} class="mt-0.5 shrink-0 text-amber-500" />
              <div class="min-w-0">{n.message}</div>
            </div>
          ))}
        </div>
      )}

      {urls.length === 0 ? (
        <p class="text-xs opacity-50">
          Visit a page in any tab — it'll show up here for analysis.
        </p>
      ) : (
        <ul class="space-y-1">
          {urls.slice(-10).reverse().map((u) => (
            <li
              key={u.id}
              class="flex items-center justify-between gap-2 text-xs"
            >
              <div class="min-w-0 flex-1 truncate">
                <span class="opacity-80">{u.title ?? u.hostname}</span>
                <span class="ml-1 opacity-40">· {u.hostname}</span>
              </div>
              {u.category && (
                <span
                  class={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${categoryColor(u.category)}`}
                >
                  {u.category}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
