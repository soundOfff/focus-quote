import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  Sparkles,
  Timer,
  XCircle,
} from "lucide-preact"
import { SessionsService } from "../../services/sessions"
import { ApiService } from "../../services/api"
import type { Session, SessionUrl } from "@focus-quote/shared"
import { runP } from "../runtime"
import { navigateTo } from "../router"
import { Badge, Button, EmptyState, ListRow, SectionHeader } from "../../ui/primitives"

interface UrlRow {
  id: string
  url: string
  hostname: string
  title: string | null
  category: string | null
  distractionScore: number | null
}

const loadSessions = (limit: number) =>
  Effect.gen(function* () {
    const sessions = yield* SessionsService
    return yield* sessions.list(limit)
  })

const loadUrls = (sessionId: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    const res = yield* api
      .getSessionUrls(sessionId)
      .pipe(Effect.catchAll(() => Effect.succeed({ urls: [] as SessionUrl[] })))
    return res.urls.map<UrlRow>((u) => ({
      id: u.id,
      url: u.url,
      hostname: u.hostname,
      title: u.title,
      category: u.category,
      distractionScore: u.distractionScore,
    }))
  })

const loadSummary = (sessionId: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    const res = yield* api
      .getSessionSummary(sessionId)
      .pipe(Effect.catchAll(() => Effect.succeed({ summary: null })))
    return res.summary
  })

// ---- helpers ----

const startOfDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const dayBucket = (iso: string): "today" | "yesterday" | "week" | "older" => {
  const t = startOfDay(new Date()).getTime()
  const d = startOfDay(new Date(iso)).getTime()
  const day = 86_400_000
  if (d === t) return "today"
  if (d === t - day) return "yesterday"
  if (d > t - 7 * day) return "week"
  return "older"
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })

const fmtMinutes = (ms: number): string => {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return sec === 0 ? `${min}m` : `${min}m ${sec}s`
}

const fmtDayHeader = (bucket: "today" | "yesterday" | "week" | "older") => {
  if (bucket === "today") return "Today"
  if (bucket === "yesterday") return "Yesterday"
  if (bucket === "week") return "This week"
  return "Earlier"
}

const categoryTone = (c: string | null): "success" | "danger" | "warning" | "info" | "neutral" => {
  const v = (c ?? "").toLowerCase()
  if (v.includes("work") || v.includes("research") || v.includes("tools"))
    return "success"
  if (v.includes("social") || v.includes("entertainment"))
    return "danger"
  if (v.includes("news") || v.includes("shopping"))
    return "warning"
  if (!c) return "neutral"
  return "info"
}

interface SessionDerived {
  plannedMs: number
  actualMs: number | null
  status: "completed" | "canceled" | "running"
}

const derive = (s: Session): SessionDerived => {
  const plannedMs = s.durationMinutes * 60_000
  if (!s.endedAt) return { plannedMs, actualMs: null, status: "running" }
  const actualMs =
    new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
  return {
    plannedMs,
    actualMs,
    status: s.completed ? "completed" : "canceled",
  }
}

// ---- card ----

interface CardProps {
  session: Session
}

function SessionCard({ session }: CardProps) {
  const [expanded, setExpanded] = useState(false)
  const [urls, setUrls] = useState<UrlRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryLoaded, setSummaryLoaded] = useState(false)

  const d = useMemo(() => derive(session), [session])

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next && urls === null && !loading) {
      setLoading(true)
      runP(loadUrls(session.id))
        .then(setUrls)
        .catch(() => setUrls([]))
        .finally(() => setLoading(false))
    }
    // Fetch summary only for completed sessions — it doesn't exist for
    // running/canceled ones. The server lazily regenerates on read if
    // it was missing.
    if (next && !summaryLoaded && d.status === "completed") {
      runP(loadSummary(session.id))
        .then((s) => {
          setSummary(s)
          setSummaryLoaded(true)
        })
        .catch(() => setSummaryLoaded(true))
    }
  }

  const categoryBreakdown = useMemo(() => {
    if (!urls) return null
    const counts = new Map<string, number>()
    for (const u of urls) {
      const key = (u.category ?? "unclassified").toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [urls])

  const avgScore = useMemo(() => {
    if (!urls || urls.length === 0) return null
    const scored = urls.filter((u) => u.distractionScore !== null)
    if (scored.length === 0) return null
    const sum = scored.reduce((acc, u) => acc + (u.distractionScore ?? 0), 0)
    return Math.round(sum / scored.length)
  }, [urls])

  const statusBadge = () => {
    if (d.status === "running")
      return (
        <Badge tone="warning">
          <Loader2 size={10} class="animate-spin" /> Running
        </Badge>
      )
    if (d.status === "completed")
      return (
        <Badge tone="success">
          <CheckCircle2 size={10} /> Completed
        </Badge>
      )
    return (
      <Badge tone="danger">
        <XCircle size={10} /> Canceled
      </Badge>
    )
  }

  return (
    <div class="rounded-md border border-hairline bg-surface shadow-[0_1px_0_rgb(0_0_0_/_0.03)] dark:shadow-none">
      <button
        type="button"
        onClick={handleToggle}
        class="flex w-full items-start gap-3 rounded-md p-4 text-left transition-colors hover:bg-surface-doc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70"
        aria-expanded={expanded}
      >
        <span class="mt-1 shrink-0 text-mute">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div class="flex-1 min-w-0">
          <div class="mb-1.5 flex flex-wrap items-center gap-2">
            <span class="truncate text-sm font-semibold text-ink">
              {session.goal || (
                <span class="text-mute">No goal</span>
              )}
            </span>
            {statusBadge()}
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
            <span class="inline-flex items-center gap-1">
              <Timer size={11} />
              <span class="tabular-nums">{fmtMinutes(d.plannedMs)}</span>
              {d.actualMs !== null && (
                <>
                  <span class="text-mute">planned ·</span>
                  <span class="tabular-nums">{fmtMinutes(d.actualMs)}</span>
                  <span class="text-mute">actual</span>
                </>
              )}
              {d.actualMs === null && (
                <span class="text-mute">planned</span>
              )}
            </span>
            <span>
              {fmtTime(session.startedAt)}
              {session.endedAt && ` → ${fmtTime(session.endedAt)}`}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div class="border-t border-hairline-soft px-4 pb-4 pt-3">
          <div class="mb-3 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                navigateTo(`/session/${session.id}`)
              }}
            >
              Open full report <ArrowUpRight size={11} />
            </Button>
          </div>
          {d.status === "completed" && (
            <div class="mb-3 rounded-md bg-accent-blue-soft p-3">
              <div class="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-link-blue">
                <Sparkles size={11} /> AI summary
              </div>
              {summary ? (
                <p class="text-xs leading-relaxed text-body">{summary}</p>
              ) : summaryLoaded ? (
                <p class="text-xs text-mute">
                  No summary available. The LLM may be unconfigured or
                  classification is still pending — try refreshing in a moment.
                </p>
              ) : (
                <p class="flex items-center gap-2 text-xs text-mute">
                  <Loader2 size={11} class="animate-spin" /> Generating…
                </p>
              )}
            </div>
          )}
          {loading && (
            <div class="flex items-center gap-2 text-xs text-mute">
              <Loader2 size={12} class="animate-spin" /> Loading URLs…
            </div>
          )}
          {!loading && urls && urls.length === 0 && (
            <p class="text-xs text-mute">
              No URLs were captured for this session.
            </p>
          )}
          {!loading && urls && urls.length > 0 && (
            <>
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <span class="text-[11px] uppercase tracking-wide text-mute">
                  {urls.length} URL{urls.length === 1 ? "" : "s"}
                </span>
                {avgScore !== null && (
                  <Badge
                    tone={
                      avgScore >= 70
                        ? "danger"
                        : avgScore >= 40
                          ? "warning"
                          : "success"
                    }
                  >
                    Avg distraction · {avgScore}
                  </Badge>
                )}
                {categoryBreakdown?.map(([cat, count]) => (
                  <Badge
                    key={cat}
                    tone={categoryTone(cat === "unclassified" ? null : cat)}
                  >
                    {cat} · {count}
                  </Badge>
                ))}
              </div>

              <ul class="space-y-1.5">
                {urls.map((u) => (
                  <li key={u.id}>
                    <ListRow class="text-xs">
                    <Globe
                      size={12}
                      class="mt-0.5 shrink-0 text-mute"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="truncate font-medium text-ink">
                          {u.hostname}
                        </span>
                        {u.category && (
                          <Badge tone={categoryTone(u.category)}>
                            {u.category}
                          </Badge>
                        )}
                        {u.distractionScore !== null && (
                          <span class="shrink-0 text-[10px] text-mute tabular-nums">
                            {u.distractionScore}
                          </span>
                        )}
                      </div>
                      {u.title && (
                        <div class="truncate text-[11px] text-mute">
                          {u.title}
                        </div>
                      )}
                    </div>
                    </ListRow>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---- section ----

export function SessionsSection() {
  const [sessions, setSessions] = useState<ReadonlyArray<Session>>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    runP(loadSessions(20))
      .then((s) => {
        setSessions(s)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  const groups = useMemo(() => {
    const out: Record<
      "today" | "yesterday" | "week" | "older",
      Session[]
    > = { today: [], yesterday: [], week: [], older: [] }
    for (const s of sessions) {
      out[dayBucket(s.startedAt)].push(s)
    }
    return out
  }, [sessions])

  if (!ready) return null
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="Recent sessions"
        description="No focus sessions yet. Start one from the popup to track URLs and review analysis here."
      />
    )
  }

  const renderGroup = (key: "today" | "yesterday" | "week" | "older") => {
    const list = groups[key]
    if (list.length === 0) return null
    return (
      <div class="flex flex-col gap-2">
        <h3 class="text-[11px] uppercase tracking-wider text-mute">
          {fmtDayHeader(key)}
        </h3>
        <div class="flex flex-col gap-2">
          {list.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <section class="flex flex-col gap-5">
      <SectionHeader title="Recent sessions" />
      {renderGroup("today")}
      {renderGroup("yesterday")}
      {renderGroup("week")}
      {renderGroup("older")}
    </section>
  )
}
