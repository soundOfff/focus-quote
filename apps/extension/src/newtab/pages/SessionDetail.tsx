import type { ComponentChildren } from "preact"
import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { Effect } from "effect"
import { SessionsService } from "../../services/sessions"
import { ApiService } from "../../services/api"
import { runP } from "../runtime"
import { navigateHome } from "../router"
import type {
  AiFeature,
  RecallQuestion,
  RecallVerdict,
  RegenerateArtifact,
  ResourceRecommendation,
  Session,
  SessionUrl,
} from "@focus-quote/shared"
import { isAiFeatureEnabled } from "@focus-quote/shared"
import { PREFS_KEY } from "../../shared/prefs"
import "./session-detail.css"

// ───────────────────────────────────────────────────────────────────────────
// Icons — the spec's exact <symbol> set (docs/Session Detail.html). Inlined
// rather than swapped for lucide so the glyph geometry / stroke-widths match
// the reference to the pixel. Rendered once via <SvgDefs/>, referenced by id.
// ───────────────────────────────────────────────────────────────────────────

function SvgDefs() {
  return (
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <defs>
        <symbol id="i-arrow-l" viewBox="0 0 24 24"><path d="M11 5 4 12l7 7M4 12h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></symbol>
        <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14 4.5L20 16M20 20v-4h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></symbol>
        <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></symbol>
        <symbol id="i-bulb" viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.1V16h6v-.4c0-.8.4-1.5 1-2.1A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></symbol>
        <symbol id="i-recall" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.2M12 17v.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></symbol>
        <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2V5zM20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2V5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></symbol>
        <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" fill="none" stroke="currentColor" stroke-width="1.6" /></symbol>
        <symbol id="i-chev-r" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></symbol>
        <symbol id="i-send" viewBox="0 0 24 24"><path d="M4 12 20 4l-6 16-3-7-7-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></symbol>
        <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6" /></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></symbol>
        <symbol id="i-ext" viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></symbol>
      </defs>
    </svg>
  )
}

function Icon({
  id,
  size,
  class: className,
}: {
  id: string
  size: number
  class?: string
}) {
  return (
    <svg width={size} height={size} class={className} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Data layer (unchanged from the previous implementation — the redesign is
// purely presentational). Each AI artifact is fetched independently so a slow
// one doesn't block the rest.
// ───────────────────────────────────────────────────────────────────────────

interface UrlRow {
  id: string
  url: string
  hostname: string
  title: string | null
  category: string | null
  visitedAt: string
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
        api
          .getResourceRecommendations(sessionId)
          .pipe(Effect.catchAll(() => Effect.succeed({ resources: null }))),
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
        visitedAt: u.visitedAt,
      })),
      summary: summaryRes.summary,
      tips: tipsRes.tips,
      questions: recallRes.questions,
      resources: resourcesRes.resources,
    } satisfies PageData
  })

// ───────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ───────────────────────────────────────────────────────────────────────────

const fmtMinutes = (ms: number): string => {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return sec === 0 ? `${min}m` : `${min}m ${sec}s`
}

/** Hours:minutes split out from the locale's day-period, so we can render a
 *  range with a single trailing meridiem ("02:21–02:36 AM") exactly like the
 *  spec, while still respecting 24-hour locales (no meridiem at all). */
const clockParts = (iso: string): { hhmm: string; meridiem: string } => {
  const fmt = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
  const parts = fmt.formatToParts(new Date(iso))
  const hhmm = parts
    .filter(
      (p) =>
        p.type === "hour" ||
        p.type === "minute" ||
        (p.type === "literal" && p.value === ":"),
    )
    .map((p) => p.value)
    .join("")
  const meridiem = parts.find((p) => p.type === "dayPeriod")?.value ?? ""
  return { hhmm, meridiem }
}

const fmtClockRange = (startIso: string, endIso: string | null): string => {
  const s = clockParts(startIso)
  if (!endIso) return s.meridiem ? `${s.hhmm} ${s.meridiem}` : s.hhmm
  const e = clockParts(endIso)
  return e.meridiem ? `${s.hhmm}–${e.hhmm} ${e.meridiem}` : `${s.hhmm}–${e.hhmm}`
}

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

/** Split a URL into a bold host (sans `www.`) and the remaining path for the
 *  serif-card read URLs. Falls back to the raw string on parse failure. */
const splitReadUrl = (raw: string): { host: string; path: string } => {
  try {
    const u = new URL(raw)
    const host = u.hostname.replace(/^www\./, "")
    let path = `${u.pathname}${u.search}${u.hash}`
    if (path === "/") path = ""
    return { host, path }
  } catch {
    return { host: raw, path: "" }
  }
}

/** Map a freeform server category onto one of the spec's three chip tints
 *  (blue = tools-ish, sage = docs-ish, neutral = everything else). */
const categoryBucket = (c: string | null): "is-blue" | "is-sage" | "" => {
  const v = (c ?? "").toLowerCase()
  if (!v) return ""
  if (/(tool|work|research|dev|code|software|product|app)/.test(v))
    return "is-blue"
  if (/(doc|reference|learn|edu|tutorial|course|wiki|guide|manual)/.test(v))
    return "is-sage"
  return ""
}

const titleCase = (c: string): string =>
  c.length === 0 ? c : c.charAt(0).toUpperCase() + c.slice(1)

interface DomainGroup {
  hostname: string
  count: number
  title: string | null
  category: string | null
  url: string
}

/** Collapse raw per-visit rows into one row per domain (most-visited first),
 *  carrying a representative title (most recent), category, and a link. */
const groupByDomain = (urls: UrlRow[]): DomainGroup[] => {
  const map = new Map<string, DomainGroup & { repAt: number }>()
  for (const u of urls) {
    const key = u.hostname || "(unknown)"
    const at = new Date(u.visitedAt).getTime() || 0
    const ex = map.get(key)
    if (!ex) {
      map.set(key, {
        hostname: key,
        count: 1,
        title: u.title,
        category: u.category,
        url: u.url,
        repAt: at,
      })
    } else {
      ex.count += 1
      if (!ex.category && u.category) ex.category = u.category
      // Representative title/link = most recent visit for the domain.
      if (at >= ex.repAt) {
        ex.repAt = at
        if (u.title) ex.title = u.title
        ex.url = u.url
      } else if (!ex.title && u.title) {
        ex.title = u.title
      }
    }
  }
  // `repAt` rides along as an extra property; the DomainGroup[] return type
  // simply ignores it (structural, non-literal assignment).
  return [...map.values()].sort((a, b) => b.count - a.count)
}

// ───────────────────────────────────────────────────────────────────────────
// Panel scaffold + AI sections
// ───────────────────────────────────────────────────────────────────────────

function Panel({
  iconId,
  title,
  sub,
  onRegenerate,
  regenerating,
  children,
}: {
  iconId: string
  title: string
  sub?: string
  onRegenerate?: () => void
  regenerating?: boolean
  children: ComponentChildren
}) {
  return (
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">
          <span class="ic">
            <Icon id={iconId} size={15} />
          </span>{" "}
          {title}
        </span>
        {onRegenerate && (
          <button
            type="button"
            class="btn-regen"
            onClick={onRegenerate}
            disabled={regenerating}
            aria-label={`Regenerate ${title}`}
            title={`Regenerate ${title}`}
          >
            <Icon id="i-refresh" size={13} class={regenerating ? "spin" : ""} />{" "}
            Regenerate
          </button>
        )}
      </div>
      {sub && <p class="panel-sub">{sub}</p>}
      {children}
    </div>
  )
}

/** Empty-state line that becomes a "Generating…" spinner while the two-phase
 *  completion pipeline is still settling just after a session finishes (#34). */
function EmptyNote({
  generating,
  label,
}: {
  generating?: boolean
  label: string
}) {
  if (generating) {
    return (
      <p class="empty-note" style="display:flex;align-items:center;gap:8px">
        <Icon id="i-refresh" size={13} class="spin" /> Generating…
      </p>
    )
  }
  return <p class="empty-note">{label}</p>
}

function SummaryPanel({
  summary,
  onRegenerate,
  regenerating,
  generating,
  noMaterial,
}: {
  summary: string | null
  onRegenerate: () => void
  regenerating: boolean
  generating?: boolean
  noMaterial?: boolean
}) {
  return (
    <Panel
      iconId="i-spark"
      title="AI summary"
      onRegenerate={onRegenerate}
      regenerating={regenerating}
    >
      {summary ? (
        <p class="summary-text">{summary}</p>
      ) : (
        <EmptyNote
          generating={generating}
          label={
            noMaterial
              ? "No pages were tracked this session, so there's nothing to summarize."
              : "No summary generated yet."
          }
        />
      )}
    </Panel>
  )
}

function TipsPanel({
  tips,
  onRegenerate,
  regenerating,
  generating,
  noMaterial,
}: {
  tips: ReadonlyArray<string> | null
  onRegenerate: () => void
  regenerating: boolean
  generating?: boolean
  noMaterial?: boolean
}) {
  return (
    <Panel
      iconId="i-bulb"
      title="Study tips"
      onRegenerate={onRegenerate}
      regenerating={regenerating}
    >
      {tips && tips.length > 0 ? (
        <ol class="tips">
          {tips.map((t, i) => (
            <li key={i}>
              <span class="n">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyNote
          generating={generating}
          label={
            noMaterial
              ? "No pages were tracked this session, so there are no study tips."
              : "No study tips generated yet."
          }
        />
      )}
    </Panel>
  )
}

interface GradeState {
  verdict: RecallVerdict
  feedback: string
}

const verdictClass = (v: RecallVerdict): string =>
  v === "correct"
    ? "is-correct"
    : v === "partial"
      ? "is-partial"
      : "is-incorrect"

function RecallPanel({
  sessionId,
  questions,
  onRegenerate,
  regenerating,
  generating,
  noMaterial,
}: {
  sessionId: string
  questions: ReadonlyArray<RecallQuestion> | null
  onRegenerate: () => void
  regenerating: boolean
  generating?: boolean
  noMaterial?: boolean
}) {
  const total = questions?.length ?? 0
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Map<number, string>>(new Map())
  const [grades, setGrades] = useState<Map<number, GradeState>>(new Map())
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [grading, setGrading] = useState<Set<number>>(new Set())

  // Clamp the cursor if a regenerate shrank the set.
  const cur = total === 0 ? 0 : Math.min(idx, total - 1)
  const q = questions && total > 0 ? questions[cur] : null

  const setAnswer = (value: string) =>
    setAnswers((prev) => new Map(prev).set(cur, value))

  const submit = () => {
    const ans = answers.get(cur)?.trim()
    if (!ans || grading.has(cur)) return
    setGrading((prev) => new Set(prev).add(cur))
    runP(
      Effect.gen(function* () {
        const api = yield* ApiService
        return yield* api.gradeRecallAnswer(sessionId, {
          questionIndex: cur,
          userAnswer: ans,
        })
      }),
    )
      .then((g) =>
        setGrades((prev) =>
          new Map(prev).set(cur, { verdict: g.verdict, feedback: g.feedback }),
        ),
      )
      .catch(() =>
        setGrades((prev) =>
          new Map(prev).set(cur, {
            verdict: "incorrect",
            feedback: "Could not grade right now — try again in a moment.",
          }),
        ),
      )
      .finally(() =>
        setGrading((prev) => {
          const next = new Set(prev)
          next.delete(cur)
          return next
        }),
      )
  }

  const toggleReveal = () =>
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(cur)) next.delete(cur)
      else next.add(cur)
      return next
    })

  const grade = grades.get(cur)
  const isGrading = grading.has(cur)
  const isRevealed = revealed.has(cur)
  const canAdvance = (grade !== undefined || isRevealed) && cur < total - 1

  return (
    <Panel
      iconId="i-recall"
      title="Active recall"
      sub="Type your answer and submit — the LLM grades it. Or reveal directly."
      onRegenerate={onRegenerate}
      regenerating={regenerating}
    >
      {q ? (
        <>
          <p class="recall-q">
            <span class="qn">{cur + 1}.</span>
            {q.q}
          </p>

          <textarea
            class="textarea"
            placeholder="Your answer…"
            aria-label="Your answer"
            value={answers.get(cur) ?? ""}
            onInput={(e) =>
              setAnswer((e.currentTarget as HTMLTextAreaElement).value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />

          <div class="recall-actions">
            <button
              type="button"
              class="btn btn-amber"
              onClick={submit}
              disabled={isGrading || !(answers.get(cur)?.trim())}
            >
              <Icon id={isGrading ? "i-refresh" : "i-send"} size={13} class={isGrading ? "spin" : ""} />{" "}
              {isGrading ? "Grading…" : "Submit"}
            </button>
            <button type="button" class="btn btn-ghost" onClick={toggleReveal}>
              <Icon id="i-eye" size={13} /> Reveal answer
            </button>
            {canAdvance && (
              <button
                type="button"
                class="recall-next right"
                onClick={() => setIdx(cur + 1)}
              >
                Next <Icon id="i-chev-r" size={11} />
              </button>
            )}
            <span class={`q-counter${canAdvance ? "" : " right"}`}>
              {cur + 1} / {total}
            </span>
          </div>

          {grade && (
            <div class={`recall-result ${verdictClass(grade.verdict)}`}>
              <span class="verdict">{grade.verdict}</span>
              {grade.feedback}
            </div>
          )}
          {isRevealed && (
            <div class="recall-answer">
              <span class="lbl">Answer</span>
              {q.a}
            </div>
          )}
        </>
      ) : (
        <EmptyNote
          generating={generating}
          label={
            noMaterial
              ? "No pages or notes were available, so there are no recall questions."
              : "No recall questions generated yet."
          }
        />
      )}
    </Panel>
  )
}

function ReadsPanel({
  resources,
  onRegenerate,
  regenerating,
  generating,
}: {
  resources: ReadonlyArray<ResourceRecommendation> | null
  onRegenerate: () => void
  regenerating: boolean
  generating?: boolean
}) {
  return (
    <Panel
      iconId="i-book"
      title="Suggested next reads"
      sub="Resources that complement what you covered. URLs are verified before saving."
      onRegenerate={onRegenerate}
      regenerating={regenerating}
    >
      {resources && resources.length > 0 ? (
        <div class="reads">
          {resources.map((r, i) => {
            const { host, path } = splitReadUrl(r.url)
            return (
              <a
                key={i}
                class="read"
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div class="read-title">
                  {r.title}{" "}
                  <span class="ext">
                    <Icon id="i-ext" size={13} />
                  </span>
                </div>
                <div class="read-desc">{r.why}</div>
                <div class="read-url">
                  <Icon id="i-globe" size={11} />{" "}
                  <span class="u">
                    <b>{host}</b>
                    {path}
                  </span>
                </div>
              </a>
            )
          })}
        </div>
      ) : (
        <EmptyNote generating={generating} label="No suggested reads yet." />
      )}
    </Panel>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// URLs visited — paper-2 collapsible, domain-grouped
// ───────────────────────────────────────────────────────────────────────────

const URL_PREVIEW = 4

function UrlsPanel({ urls }: { urls: UrlRow[] }) {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const groups = useMemo(() => groupByDomain(urls), [urls])
  const visible = showAll ? groups : groups.slice(0, URL_PREVIEW)
  const total = urls.length

  return (
    <div class={`urls${open ? " is-open" : ""}`}>
      <button
        type="button"
        class="urls-bar"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span class="left">
          <span class="ic">
            <Icon id="i-globe" size={15} />
          </span>
          <span class="ttl">
            URLs visited <span class="count">({total})</span>
          </span>
        </span>
        <Icon id="i-chev-r" size={16} class="chev" />
      </button>
      <div class="urls-list">
        {visible.map((g) => {
          const bucket = categoryBucket(g.category)
          return (
            <a
              key={g.hostname}
              class="url-row"
              href={g.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="favicon">
                <Icon id="i-globe" size={15} />
              </span>
              <span class="u-main">
                <div class="u-top">
                  <span class="u-host">{g.hostname}</span>
                  {g.category && (
                    <span class={`cat ${bucket}`.trim()}>
                      {titleCase(g.category)}
                    </span>
                  )}
                  <span class="u-count">
                    {g.count} visit{g.count === 1 ? "" : "s"}
                  </span>
                </div>
                {g.title && <div class="u-query">{g.title}</div>}
              </span>
              <span class="u-open" aria-label="Open in new tab">
                <Icon id="i-ext" size={14} />
              </span>
            </a>
          )
        })}
        {!showAll && groups.length > URL_PREVIEW && (
          <button
            type="button"
            class="urls-more"
            onClick={() => setShowAll(true)}
          >
            Show all {total} visits
          </button>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────

interface Props {
  sessionId: string
}

// A session counts as "just finished" (so empty artifact panels show a
// generating state and we auto-poll) for this long after it ends.
const RECENTLY_FINISHED_MS = 3 * 60_000
const GENERATING_POLL_INTERVAL_MS = 3000
const GENERATING_POLL_LIMIT = 6

// The study artifacts a generate-all run fans out, each mapped to the AI
// feature that gates it (ADR 0002). "topic" is gated by the master switch only.
const GENERATE_ALL_ARTIFACTS: ReadonlyArray<{
  artifact: RegenerateArtifact
  feature: AiFeature
}> = [
  { artifact: "summary", feature: "sessionSummary" },
  { artifact: "studyTips", feature: "studyTips" },
  { artifact: "recallQuestions", feature: "recallQuestions" },
  { artifact: "resourceRecommendations", feature: "resourceRecommendations" },
]

export function SessionDetail({ sessionId }: Props) {
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState<Set<RegenerateArtifact>>(
    new Set(),
  )
  const [aiMasterEnabled, setAiMasterEnabled] = useState(true)
  const [autoTitleEnabled, setAutoTitleEnabled] = useState(false)
  const [featureOverrides, setFeatureOverrides] = useState<
    Partial<Record<AiFeature, boolean>>
  >({})
  const [generatingAll, setGeneratingAll] = useState(false)

  useEffect(() => {
    chrome.storage.local
      .get(PREFS_KEY)
      .then((out) => {
        const p = out[PREFS_KEY] as Record<string, unknown> | undefined
        if (typeof p?.aiMasterEnabled === "boolean") {
          setAiMasterEnabled(p.aiMasterEnabled)
        }
        if (typeof p?.autoTitleEnabled === "boolean") {
          setAutoTitleEnabled(p.autoTitleEnabled)
        }
        if (p?.aiFeatureOverrides && typeof p.aiFeatureOverrides === "object") {
          setFeatureOverrides(
            p.aiFeatureOverrides as Partial<Record<AiFeature, boolean>>,
          )
        }
      })
      .catch(() => {})
  }, [])

  const refresh = () => {
    setLoading(true)
    runP(loadAll(sessionId))
      .then((d) => setData(d))
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

  const generateAll = () => {
    const targets: RegenerateArtifact[] = []
    if (aiMasterEnabled) targets.push("topic")
    for (const t of GENERATE_ALL_ARTIFACTS) {
      if (
        isAiFeatureEnabled(t.feature, {
          masterEnabled: aiMasterEnabled,
          featureOverrides,
        })
      ) {
        targets.push(t.artifact)
      }
    }
    if (
      !data?.session?.goal &&
      isAiFeatureEnabled("autoTitle", {
        masterEnabled: aiMasterEnabled,
        featureOverrides: { ...featureOverrides, autoTitle: autoTitleEnabled },
      })
    ) {
      targets.push("title")
    }
    if (targets.length === 0) return
    setGeneratingAll(true)
    runP(
      Effect.gen(function* () {
        const api = yield* ApiService
        for (const artifact of targets) {
          yield* api
            .regenerateArtifact(sessionId, { artifact })
            .pipe(Effect.catchAll(() => Effect.void))
        }
      }),
    )
      .then(() => refresh())
      .catch(() => {})
      .finally(() => setGeneratingAll(false))
  }

  const pollRef = useRef(0)
  useEffect(() => {
    pollRef.current = 0
    refresh()
  }, [sessionId])

  // Just after a session finishes, the two-phase completion pipeline (ADR-0004)
  // is still generating artifacts in the background. Poll a few times so the
  // "Generating…" panels fill in without the user hitting Refresh. Self-bounded:
  // stops once nothing is missing, the recency window lapses, or the cap is hit.
  useEffect(() => {
    const sess = data?.session
    if (!sess) return
    const recent =
      sess.completed &&
      !!sess.endedAt &&
      Date.now() - new Date(sess.endedAt).getTime() < RECENTLY_FINISHED_MS
    const missing =
      !data.summary ||
      !(data.tips && data.tips.length) ||
      !(data.questions && data.questions.length) ||
      !(data.resources && data.resources.length)
    if (!recent || !missing || pollRef.current >= GENERATING_POLL_LIMIT) return
    const id = window.setTimeout(() => {
      pollRef.current += 1
      refresh()
    }, GENERATING_POLL_INTERVAL_MS)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable per sessionId
  }, [data])

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

  // ── Initial load skeleton ──
  if (loading && !data) {
    return (
      <div class="fq-session-detail">
        <SvgDefs />
        <div class="shell">
          <div class="topbar">
            <button type="button" class="back" onClick={navigateHome}>
              <Icon id="i-arrow-l" size={15} /> Back
            </button>
          </div>
          <div class="hero">
            <div class="sk" style="height:18px;width:96px;border-radius:999px;margin-bottom:13px" />
            <div class="sk" style="height:30px;width:62%;margin-bottom:14px" />
            <div class="sk" style="height:11px;width:80%" />
          </div>
          {[0, 1, 2].map((i) => (
            <div class="panel" key={i}>
              <div class="sk" style="height:15px;width:34%;margin-bottom:14px" />
              <div class="sk" style="height:12px;width:100%;margin-bottom:8px" />
              <div class="sk" style="height:12px;width:88%" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Not found ──
  if (!data?.session) {
    return (
      <div class="fq-session-detail">
        <SvgDefs />
        <div class="shell">
          <div class="topbar">
            <button type="button" class="back" onClick={navigateHome}>
              <Icon id="i-arrow-l" size={15} /> Back
            </button>
          </div>
          <div class="panel">
            <span class="panel-title">
              <span class="ic">
                <Icon id="i-globe" size={15} />
              </span>{" "}
              Session not found
            </span>
            <p class="panel-sub">
              This session may not be synced to this device yet.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const s = data.session
  const d = derived!
  const hasArtifacts = !!(
    data.summary ||
    (data.tips && data.tips.length) ||
    (data.questions && data.questions.length) ||
    (data.resources && data.resources.length)
  )
  const showAiPanels = d.status === "completed" || hasArtifacts

  // A freshly-finished session whose artifacts haven't landed yet should show a
  // "Generating…" state rather than an empty "No X yet" note (#34).
  const recentlyFinished =
    d.status === "completed" &&
    !!s.endedAt &&
    Date.now() - new Date(s.endedAt).getTime() < RECENTLY_FINISHED_MS

  // The session-end generators for summary/tips/recall need at least one
  // tracked page to work from (recall can also use saved notes, but those are
  // surfaced as questions when they exist). With no captured URLs there's
  // nothing to generate, so show an explanatory empty state instead of an
  // endless "Generating…" spinner. Resources still generate from goal+topic.
  const noMaterial = data.urls.length === 0

  const statusClass =
    d.status === "completed"
      ? ""
      : d.status === "canceled"
        ? " is-canceled"
        : " is-running"
  const statusLabel =
    d.status === "completed"
      ? "Completed"
      : d.status === "canceled"
        ? "Canceled"
        : "Running"

  return (
    <div class="fq-session-detail">
      <SvgDefs />
      <div class="shell">
        {/* Top bar */}
        <div class="topbar">
          <button type="button" class="back" onClick={navigateHome}>
            <Icon id="i-arrow-l" size={15} /> Back
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={refresh}
            aria-label="Refresh session"
          >
            <Icon id="i-refresh" size={13} class={loading ? "spin" : ""} />{" "}
            Refresh
          </button>
        </div>

        {/* Hero */}
        <div class="hero">
          <span class={`status${statusClass}`}>
            <span class="dot" /> {statusLabel}
          </span>
          <h1>{s.goal || s.title || "Untitled session"}</h1>
          <div class="meta">
            {s.topic && (
              <>
                <span class="m">
                  <Icon id="i-book" size={11} /> {s.topic}
                </span>
                <span class="sep">·</span>
              </>
            )}
            <span class="m">
              <b>{fmtMinutes(d.plannedMs)}</b> planned
            </span>
            {d.actualMs !== null && (
              <>
                <span class="sep">·</span>
                <span class="m">
                  <b>{fmtMinutes(d.actualMs)}</b> actual
                </span>
              </>
            )}
            <span class="sep">·</span>
            <span class="m">
              <Icon id="i-clock" size={11} /> {fmtClockRange(s.startedAt, s.endedAt)}
            </span>
            <span class="sep">·</span>
            <span class="m">{fmtDate(s.startedAt)}</span>
            <span class="sep">·</span>
            <span class="m">
              <b>{data.urls.length}</b> URL{data.urls.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* AI panels — shown when the session completed or any artifact exists */}
        {showAiPanels && (
          <>
            <SummaryPanel
              summary={data.summary}
              onRegenerate={() => regenerate("summary")}
              regenerating={regenerating.has("summary")}
              generating={recentlyFinished && !data.summary && !noMaterial}
              noMaterial={noMaterial}
            />
            <TipsPanel
              tips={data.tips}
              onRegenerate={() => regenerate("studyTips")}
              regenerating={regenerating.has("studyTips")}
              generating={
                recentlyFinished &&
                !(data.tips && data.tips.length) &&
                !noMaterial
              }
              noMaterial={noMaterial}
            />
            <RecallPanel
              sessionId={sessionId}
              questions={data.questions}
              onRegenerate={() => regenerate("recallQuestions")}
              regenerating={regenerating.has("recallQuestions")}
              generating={
                recentlyFinished &&
                !(data.questions && data.questions.length) &&
                !noMaterial
              }
              noMaterial={noMaterial}
            />
            <ReadsPanel
              resources={data.resources}
              onRegenerate={() => regenerate("resourceRecommendations")}
              regenerating={regenerating.has("resourceRecommendations")}
              generating={
                recentlyFinished && !(data.resources && data.resources.length)
              }
            />
          </>
        )}

        {/* Unfinished + no artifacts: offer a one-shot generate-all */}
        {!showAiPanels && data.urls.length > 0 && (
          <div class="panel">
            <div class="panel-head">
              <span class="panel-title">
                <span class="ic">
                  <Icon id="i-spark" size={15} />
                </span>{" "}
                AI insights
              </span>
            </div>
            <p class="panel-sub">
              This session didn't finish — generate its AI summary, study tips,
              recall questions, and suggested reads now.
            </p>
            <div style="margin-top:14px;display:flex;flex-direction:column;align-items:flex-start;gap:8px">
              <button
                type="button"
                class="btn btn-amber"
                onClick={generateAll}
                disabled={!aiMasterEnabled || generatingAll}
              >
                <Icon
                  id={generatingAll ? "i-refresh" : "i-spark"}
                  size={13}
                  class={generatingAll ? "spin" : ""}
                />{" "}
                {generatingAll ? "Generating…" : "Generate all"}
              </button>
              {!aiMasterEnabled && (
                <p class="panel-sub" style="margin:0">
                  AI is turned off — enable it in Settings.
                </p>
              )}
            </div>
          </div>
        )}

        {/* URLs visited */}
        {data.urls.length > 0 && <UrlsPanel urls={data.urls} />}
      </div>
    </div>
  )
}
