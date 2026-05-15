import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import {
  ArrowLeft,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Lightbulb,
  Loader2,
  RefreshCw,
  RotateCw,
  Send,
  Sparkles,
  Timer,
  XCircle,
} from "lucide-preact"
import { SessionsService } from "../../services/sessions"
import { ApiService } from "../../services/api"
import { runP } from "../runtime"
import { navigateHome } from "../router"
import type {
  RecallQuestion,
  RecallVerdict,
  RegenerateArtifact,
  ResourceRecommendation,
  Session,
  SessionUrl,
} from "@focus-quote/shared"
import {
  Badge,
  Button,
  EmptyState,
  ListRow,
  SectionHeader,
  SkeletonCard,
  Surface,
} from "../../ui/primitives"
import { AppShell } from "../../ui/AppShell"

interface UrlRow {
  id: string
  url: string
  hostname: string
  title: string | null
  category: string | null
  distractionScore: number | null
}

interface PageData {
  session: Session | null
  urls: UrlRow[]
  summary: string | null
  tips: ReadonlyArray<string> | null
  questions: ReadonlyArray<RecallQuestion> | null
  resources: ReadonlyArray<ResourceRecommendation> | null
}

const loadAll = (sessionId: string) =>
  Effect.gen(function* () {
    const sessionsSvc = yield* SessionsService
    const api = yield* ApiService

    const all = yield* sessionsSvc.list(50)
    const session = all.find((s) => s.id === sessionId) ?? null

    const urlsRes = yield* api
      .getSessionUrls(sessionId)
      .pipe(Effect.catchAll(() => Effect.succeed({ urls: [] as SessionUrl[] })))

    // The four AI artifacts — independent fetches so a slow one doesn't
    // block the rest. Each falls back to null on error.
    const [summaryRes, tipsRes, recallRes, resourcesRes] = yield* Effect.all(
      [
        api
          .getSessionSummary(sessionId)
          .pipe(Effect.catchAll(() => Effect.succeed({ summary: null }))),
        api
          .getStudyTips(sessionId)
          .pipe(Effect.catchAll(() => Effect.succeed({ tips: null }))),
        api
          .getRecallQuestions(sessionId)
          .pipe(Effect.catchAll(() => Effect.succeed({ questions: null }))),
        api.getResourceRecommendations(sessionId).pipe(
          Effect.catchAll(() => Effect.succeed({ resources: null })),
        ),
      ],
      { concurrency: "unbounded" },
    )

    return {
      session,
      urls: urlsRes.urls.map<UrlRow>((u) => ({
        id: u.id,
        url: u.url,
        hostname: u.hostname,
        title: u.title,
        category: u.category,
        distractionScore: u.distractionScore,
      })),
      summary: summaryRes.summary,
      tips: tipsRes.tips,
      questions: recallRes.questions,
      resources: resourcesRes.resources,
    } satisfies PageData
  })

// ---- helpers (small ones inline; bigger ones from SessionsSection) ----

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

const fmtMinutes = (ms: number): string => {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return sec === 0 ? `${min}m` : `${min}m ${sec}s`
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

// ---- sub-components ----

interface BlockCommon {
  onRegenerate: () => void
  regenerating: boolean
}

function SummaryBlock({
  summary,
  onRegenerate,
  regenerating,
}: { summary: string | null } & BlockCommon) {
  return (
    <Section
      icon={<Sparkles size={14} class="text-mute" />}
      title="AI summary"
      onRegenerate={onRegenerate}
      regenerating={regenerating}
    >
      {summary ? (
        <p class="text-sm leading-relaxed">{summary}</p>
      ) : (
        <p class="text-xs opacity-50">Generating… reload in a moment.</p>
      )}
    </Section>
  )
}

function TipsBlock({
  tips,
  onRegenerate,
  regenerating,
}: { tips: ReadonlyArray<string> | null } & BlockCommon) {
  return (
    <Section
      icon={<Lightbulb size={14} class="text-mute" />}
      title="Study tips"
      onRegenerate={onRegenerate}
      regenerating={regenerating}
    >
      {tips && tips.length > 0 ? (
        <ul class="space-y-2">
          {tips.map((t, i) => (
            <li
              key={i}
              class="flex gap-2 text-sm leading-relaxed"
            >
              <span class="shrink-0 text-link-blue">{i + 1}.</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="text-xs opacity-50">
          Generating tips… reload in a moment.
        </p>
      )}
    </Section>
  )
}

interface GradeState {
  verdict: RecallVerdict
  feedback: string
}

function RecallBlock({
  sessionId,
  questions,
  onRegenerate,
  regenerating,
}: {
  sessionId: string
  questions: ReadonlyArray<RecallQuestion> | null
} & BlockCommon) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [answers, setAnswers] = useState<Map<number, string>>(new Map())
  const [grading, setGrading] = useState<Set<number>>(new Set())
  const [grades, setGrades] = useState<Map<number, GradeState>>(new Map())

  const toggle = (idx: number) => {
    const next = new Set(revealed)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setRevealed(next)
  }
  const setAnswer = (idx: number, value: string) => {
    const next = new Map(answers)
    next.set(idx, value)
    setAnswers(next)
  }
  const submit = (idx: number) => {
    const ans = answers.get(idx)?.trim()
    if (!ans) return
    setGrading((prev) => new Set(prev).add(idx))
    runP(
      Effect.gen(function* () {
        const api = yield* ApiService
        return yield* api.gradeRecallAnswer(sessionId, {
          questionIndex: idx,
          userAnswer: ans,
        })
      }),
    )
      .then((g) => {
        setGrades((prev) => {
          const next = new Map(prev)
          next.set(idx, { verdict: g.verdict, feedback: g.feedback })
          return next
        })
      })
      .catch(() => {
        setGrades((prev) => {
          const next = new Map(prev)
          next.set(idx, {
            verdict: "incorrect",
            feedback: "Could not grade right now — try again in a moment.",
          })
          return next
        })
      })
      .finally(() => {
        setGrading((prev) => {
          const next = new Set(prev)
          next.delete(idx)
          return next
        })
      })
  }

  const verdictClasses = (v: RecallVerdict) => {
    if (v === "correct")
      return "bg-accent-green-soft text-accent-green"
    if (v === "partial") return "bg-primary/20 text-ink"
    return "bg-accent-red-soft text-accent-red"
  }

  return (
    <Section
      icon={<Brain size={14} class="text-mute" />}
      title="Active recall"
      subtitle="Type your answer and submit — the LLM grades it. Or reveal directly."
      onRegenerate={onRegenerate}
      regenerating={regenerating}
    >
      {questions && questions.length > 0 ? (
        <ol class="space-y-4">
          {questions.map((q, i) => {
            const grade = grades.get(i)
            const isGrading = grading.has(i)
            return (
              <li key={i} class="rounded-md border border-hairline-soft bg-surface-doc p-3">
                <div class="mb-2 text-sm font-medium">
                  {i + 1}. {q.q}
                </div>
                <textarea
                  rows={2}
                  placeholder="Your answer…"
                  value={answers.get(i) ?? ""}
                  onInput={(e) =>
                    setAnswer(
                      i,
                      (e.currentTarget as HTMLTextAreaElement).value,
                    )
                  }
                  class="w-full resize-none rounded-sm border border-hairline bg-surface px-2 py-1.5 text-xs text-body outline-none focus:ring-1 focus:ring-focus-ring/70"
                />
                <div class="mt-2 flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => submit(i)}
                    disabled={isGrading || !(answers.get(i)?.trim())}
                  >
                    {isGrading ? (
                      <Loader2 size={11} class="animate-spin" />
                    ) : (
                      <Send size={11} />
                    )}
                    {isGrading ? "Grading…" : "Submit"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggle(i)}
                  >
                    {revealed.has(i) ? (
                      <>
                        <EyeOff size={11} /> Hide answer
                      </>
                    ) : (
                      <>
                        <Eye size={11} /> Reveal answer
                      </>
                    )}
                  </Button>
                </div>
                {grade && (
                  <div class={`mt-2 rounded-md p-2 text-xs ${verdictClasses(grade.verdict)}`}>
                    <div class="mb-1 font-medium uppercase tracking-wide">
                      {grade.verdict}
                    </div>
                    <p class="leading-relaxed">{grade.feedback}</p>
                  </div>
                )}
                {revealed.has(i) && (
                  <p class="mt-2 rounded-md bg-accent-green-soft p-2 text-xs leading-relaxed text-accent-green">
                    <span class="text-mute">Expected: </span>
                    {q.a}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        <p class="text-xs opacity-50">
          Generating recall questions… reload in a moment.
        </p>
      )}
    </Section>
  )
}

function ResourcesBlock({
  resources,
  onRegenerate,
  regenerating,
}: {
  resources: ReadonlyArray<ResourceRecommendation> | null
} & BlockCommon) {
  return (
    <Section
      icon={<BookOpen size={14} class="text-mute" />}
      title="Suggested next reads"
      subtitle="Resources that complement what you covered. URLs are verified before saving."
      onRegenerate={onRegenerate}
      regenerating={regenerating}
    >
      {resources && resources.length > 0 ? (
        <ul class="space-y-2">
          {resources.map((r, i) => (
            <li key={i} class="rounded-md border border-hairline-soft bg-surface-doc p-3">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1 text-sm font-medium text-link-blue transition-colors hover:text-ink"
              >
                {r.title}
                <ExternalLink size={11} />
              </a>
              <p class="mt-1 text-xs text-body">{r.why}</p>
              <p class="mt-1 truncate font-mono text-[11px] text-mute">
                {r.url}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p class="text-xs opacity-50">
          Generating recommendations… reload in a moment.
        </p>
      )}
    </Section>
  )
}

function Section({
  icon,
  title,
  subtitle,
  onRegenerate,
  regenerating,
  children,
}: {
  icon: preact.ComponentChildren
  title: string
  subtitle?: string
  onRegenerate?: () => void
  regenerating?: boolean
  children: preact.ComponentChildren
}) {
  return (
    <Surface>
      <SectionHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        action={
          onRegenerate ? (
            <Button
              onClick={onRegenerate}
              disabled={regenerating}
              variant="ghost"
              size="sm"
              aria-label="Regenerate"
              title="Regenerate"
            >
              <RefreshCw size={11} class={regenerating ? "animate-spin" : ""} />
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          ) : null
        }
      />
      {children}
    </Surface>
  )
}

function UrlsBlock({ urls }: { urls: UrlRow[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Surface class="p-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        class="flex w-full items-center gap-2 p-5 text-left transition-colors hover:bg-surface-doc"
      >
        <Globe size={14} class="text-mute" />
        <h2 class="text-sm font-semibold text-ink">
          URLs visited{" "}
          <span class="text-mute tabular-nums">({urls.length})</span>
        </h2>
        <span class="ml-auto text-mute">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && (
        <ul class="space-y-1.5 px-5 pb-5">
          {urls.map((u) => (
            <li key={u.id}>
              <ListRow class="text-xs">
              <Globe size={11} class="mt-0.5 shrink-0 text-mute" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="truncate font-medium text-ink hover:underline"
                  >
                    {u.hostname}
                  </a>
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
      )}
    </Surface>
  )
}

// ---- page ----

interface Props {
  sessionId: string
}

export function SessionDetail({ sessionId }: Props) {
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState<Set<RegenerateArtifact>>(
    new Set(),
  )

  const refresh = () => {
    setLoading(true)
    runP(loadAll(sessionId))
      .then((d) => {
        setData(d)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  const regenerate = (artifact: RegenerateArtifact) => {
    setRegenerating((prev) => new Set(prev).add(artifact))
    runP(
      Effect.gen(function* () {
        const api = yield* ApiService
        yield* api.regenerateArtifact(sessionId, { artifact })
      }),
    )
      .then(() => refresh())
      .catch(() => {
        /* swallow — error surfaces as unchanged data on refresh */
      })
      .finally(() => {
        setRegenerating((prev) => {
          const next = new Set(prev)
          next.delete(artifact)
          return next
        })
      })
  }

  useEffect(() => {
    refresh()
  }, [sessionId])

  const derived = useMemo(() => {
    if (!data?.session) return null
    const s = data.session
    const plannedMs = s.durationMinutes * 60_000
    const actualMs = s.endedAt
      ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
      : null
    const status: "completed" | "canceled" | "running" = !s.endedAt
      ? "running"
      : s.completed
        ? "completed"
        : "canceled"
    return { plannedMs, actualMs, status }
  }, [data])

  if (loading && !data) {
    return (
      <AppShell page="session-detail">
        <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={5} />
        </div>
      </AppShell>
    )
  }

  if (!data?.session) {
    return (
      <AppShell page="session-detail">
        <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
          <Button onClick={navigateHome} variant="ghost" size="sm" class="self-start">
            <ArrowLeft size={12} /> Back
          </Button>
          <EmptyState
            title="Session not found"
            description="This session may not be synced to this device yet."
          />
        </div>
      </AppShell>
    )
  }

  const s = data.session
  const d = derived!

  return (
    <AppShell page="session-detail">
      <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
        <div class="flex items-center justify-between">
          <Button onClick={navigateHome} variant="ghost" size="sm">
            <ArrowLeft size={12} /> Back
          </Button>
          <Button onClick={refresh} variant="ghost" size="sm" aria-label="Refresh">
            <RotateCw size={12} /> Refresh
          </Button>
        </div>

        <Surface>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            {d.status === "completed" && (
              <Badge tone="success">
                <CheckCircle2 size={10} /> Completed
              </Badge>
            )}
            {d.status === "canceled" && (
              <Badge tone="danger">
                <XCircle size={10} /> Canceled
              </Badge>
            )}
            {d.status === "running" && (
              <Badge tone="warning">
                <Loader2 size={10} class="animate-spin" /> Running
              </Badge>
            )}
          </div>
          <h1 class="text-balance text-2xl font-bold text-ink">
            {s.goal || (
              <span class="text-mute">Session without a goal</span>
            )}
          </h1>
          <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-mute">
            <span class="inline-flex items-center gap-1">
              <Timer size={11} />
              <span class="tabular-nums">{fmtMinutes(d.plannedMs)}</span>
              <span class="text-mute">planned</span>
              {d.actualMs !== null && (
                <>
                  <span class="text-mute">·</span>
                  <span class="tabular-nums">{fmtMinutes(d.actualMs)}</span>
                  <span class="text-mute">actual</span>
                </>
              )}
            </span>
            <span>started {fmtTime(s.startedAt)}</span>
            {s.endedAt && <span>ended {fmtTime(s.endedAt)}</span>}
            <span class="tabular-nums text-mute">
              {data.urls.length} URL{data.urls.length === 1 ? "" : "s"}
            </span>
          </div>
        </Surface>

        {d.status === "completed" && (
          <>
            <SummaryBlock
              summary={data.summary}
              onRegenerate={() => regenerate("summary")}
              regenerating={regenerating.has("summary")}
            />
            <TipsBlock
              tips={data.tips}
              onRegenerate={() => regenerate("studyTips")}
              regenerating={regenerating.has("studyTips")}
            />
            <RecallBlock
              sessionId={sessionId}
              questions={data.questions}
              onRegenerate={() => regenerate("recallQuestions")}
              regenerating={regenerating.has("recallQuestions")}
            />
            <ResourcesBlock
              resources={data.resources}
              onRegenerate={() =>
                regenerate("resourceRecommendations")
              }
              regenerating={regenerating.has(
                "resourceRecommendations",
              )}
            />
          </>
        )}

        {d.status !== "completed" && data.urls.length > 0 && (
          <Section
            icon={<Sparkles size={14} class="text-mute" />}
            title="AI insights"
            subtitle="Complete the session to unlock AI summary, study tips, recall questions, and resource recommendations."
          >
            <div class="h-1" />
          </Section>
        )}

        <UrlsBlock urls={data.urls} />
      </div>
    </AppShell>
  )
}
