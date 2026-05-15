import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
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

export interface AnalysisState {
  active: ActiveSession | null
  urls: UrlRow[]
  /** The latest nudge surfaced by the classifier, if any. */
  latestNudge: Nudge | null
  /** A one-line summary suitable for the popup's Today's intent band. */
  insightLine: string | null
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

const buildInsightLine = (
  urls: ReadonlyArray<UrlRow>,
  nudge: Nudge | null,
): string | null => {
  // Live nudges always take precedence — they're the action signal we want
  // pushed into the intent band.
  if (nudge) return nudge.message
  if (urls.length === 0) return null
  const scored = urls.filter((u) => u.distractionScore !== null)
  if (scored.length === 0) {
    return `Tracking ${urls.length} ${urls.length === 1 ? "page" : "pages"} for this session.`
  }
  const avg = Math.round(
    scored.reduce((acc, u) => acc + (u.distractionScore ?? 0), 0) /
      scored.length,
  )
  if (avg >= 70) {
    return `Drifting — average ${avg}/100 distraction across ${urls.length} pages.`
  }
  if (avg >= 40) {
    return `Mixed focus — average ${avg}/100 distraction across ${urls.length} pages.`
  }
  return `On goal — average ${avg}/100 distraction across ${urls.length} pages.`
}

/**
 * Background hook that polls + subscribes to the active session's analysis
 * stream. The returned `insightLine` is rendered as a secondary line in the
 * popup's Today's intent band — that's the only visible surface this hook
 * still drives in Direction A (the old standalone panel is gone).
 */
export function useAnalysisInsight(): AnalysisState {
  const [active, setActive] = useState<ActiveSession | null>(null)
  const [urls, setUrls] = useState<UrlRow[]>([])
  const [latestNudge, setLatestNudge] = useState<Nudge | null>(null)

  const refresh = () =>
    runP(loadActiveAndUrls)
      .then(({ active: a, urls: u }) => {
        setActive(a)
        setUrls(u)
      })
      .catch(() => {
        /* signed-out or transient — ignore */
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
        setLatestNudge({
          sessionUrlId: event.sessionUrlId,
          message: event.message,
          receivedAt: Date.now(),
        })
        refresh()
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [])

  return {
    active,
    urls,
    latestNudge,
    insightLine: buildInsightLine(urls, latestNudge),
  }
}
