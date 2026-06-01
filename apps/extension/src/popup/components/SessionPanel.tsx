import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import { Briefcase, Play, Square, Timer } from "lucide-preact"
import { SessionsService, type ActiveSession } from "../../services/sessions"
import type { SessionMode, SessionStartMessage } from "../../shared/messages"
import { StorageService } from "../../services/storage"
import { answeredCount, loadJobProfile } from "../../shared/job-profile"
import { runP } from "../runtime"
import {
  Button,
  MonoLabel,
  Segmented,
  type SegmentedItem,
} from "../../ui/primitives"

const MODE_ITEMS: ReadonlyArray<SegmentedItem<SessionMode>> = [
  { value: "focus", label: "Focus" },
  { value: "job", label: "Job application" },
]

const formatRemaining = (expectedEndAt: string) => {
  const ms = new Date(expectedEndAt).getTime() - Date.now()
  if (ms <= 0) return "0:00"
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

// The focus-session segmented control offers a few common preset durations,
// plus whatever default duration the user configured on the Options page — so
// the popup always reflects (and pre-selects) that saved default instead of
// ignoring it.
const DURATION_PRESETS = [15, 25, 45] as const

const clampDuration = (n: number): number =>
  Math.max(1, Math.min(180, Math.floor(n)))

const buildDurationItems = (
  defaultDuration: number,
): ReadonlyArray<SegmentedItem<number>> => {
  const values = Array.from(
    new Set<number>([...DURATION_PRESETS, clampDuration(defaultDuration)]),
  ).sort((a, b) => a - b)
  return values.map((m) => ({ value: m, label: String(m) }))
}

interface Props {
  defaultDurationMinutes: number
  defaultBreakMinutes: number
  onChange?: () => void
}

export function SessionPanel({
  defaultDurationMinutes,
  defaultBreakMinutes,
  onChange,
}: Props) {
  const [active, setActive] = useState<ActiveSession | null>(null)
  const [goal, setGoal] = useState("")
  const [selected, setSelected] = useState<number | null>(null)
  const [remaining, setRemaining] = useState("")
  const [mode, setMode] = useState<SessionMode>("focus")
  // Whether the local Application Profile is still empty — drives the "set up
  // in Options" hint when starting a job session.
  const [jobProfileEmpty, setJobProfileEmpty] = useState(false)

  const durationItems = useMemo(
    () => buildDurationItems(defaultDurationMinutes),
    [defaultDurationMinutes],
  )

  // Default to the configured Options duration; switch to whatever preset the
  // user picks in the popup. Both are always present in `durationItems`, so the
  // segmented control is always highlighted.
  const duration = selected ?? clampDuration(defaultDurationMinutes)

  const refresh = () =>
    runP(
      Effect.gen(function* () {
        const sessions = yield* SessionsService
        return yield* sessions.getActive
      }),
    )
      .then((a) => setActive(a))
      .catch(() => setActive(null))

  useEffect(() => {
    refresh()
  }, [])

  // Load the Application Profile once to decide whether to nudge the user to
  // set up their CV / answers before drafting. Best-effort; never blocks start.
  useEffect(() => {
    runP(
      Effect.gen(function* () {
        const storage = yield* StorageService
        return yield* loadJobProfile(storage)
      }),
    )
      .then((p) =>
        setJobProfileEmpty(
          p.cv.trim().length === 0 && answeredCount(p.templates) === 0,
        ),
      )
      .catch(() => setJobProfileEmpty(false))
  }, [])

  useEffect(() => {
    if (!active) {
      setRemaining("")
      return
    }
    const tick = () => setRemaining(formatRemaining(active.expectedEndAt))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [active])

  const handleStart = () => {
    const payload: SessionStartMessage = {
      type: "focusquote.session.start",
      durationMinutes: Math.max(1, Math.min(180, Math.floor(duration))),
      breakMinutes: Math.max(0, Math.min(60, Math.floor(defaultBreakMinutes))),
      goal: goal.trim() || null,
      mode,
    }
    chrome.runtime
      .sendMessage(payload)
      .then(() => {
        refresh()
        onChange?.()
      })
      .catch((err) => console.error("[FocusQuote] start session:", err))
  }

  const handleStop = () => {
    chrome.runtime
      .sendMessage({ type: "focusquote.session.cancel" })
      .then(() => {
        refresh()
        onChange?.()
      })
      .catch((err) => console.error("[FocusQuote] cancel session:", err))
  }

  if (active) {
    const isJob = active.mode === "job"
    return (
      <div class="flex flex-col gap-3">
        <MonoLabel>{isJob ? "Job application" : "Focus session"}</MonoLabel>
        <div class="flex items-center justify-between gap-3 rounded-card border border-rule bg-paper-2 px-3 py-[10px]">
          <div class="flex min-w-0 items-center gap-2">
            {isJob ? (
              <Briefcase
                size={14}
                strokeWidth={1.8}
                class="shrink-0 text-amber-deep"
                aria-hidden
              />
            ) : (
              <Timer
                size={14}
                strokeWidth={1.8}
                class="shrink-0 text-amber-deep"
                aria-hidden
              />
            )}
            <div class="min-w-0">
              <div class="font-mono text-[18px] font-medium leading-none tracking-[-0.005em] text-ink">
                {remaining}
              </div>
              <div class="mt-1 truncate text-[11.5px] text-muted">
                {active.goal ?? (isJob ? "Applying…" : "Focusing…")}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleStop}>
            <Square size={11} strokeWidth={2} />
            Stop
          </Button>
        </div>
      </div>
    )
  }

  const isJob = mode === "job"

  return (
    <div class="flex flex-col gap-[10px]">
      <MonoLabel>{isJob ? "Job application" : "Focus session"}</MonoLabel>
      <Segmented<SessionMode>
        items={MODE_ITEMS}
        value={mode}
        onChange={setMode}
        size="sm"
        variant="amber"
        class="self-start text-[12px]"
      />
      <input
        type="text"
        placeholder={
          isJob
            ? "Which role or company are you applying to?"
            : "What are you focusing on?"
        }
        value={goal}
        onInput={(e) => setGoal((e.currentTarget as HTMLInputElement).value)}
        class="rounded-control border border-rule-2 bg-paper-2 px-[11px] py-[9px] text-[13px] text-ink placeholder:text-muted-2 focus:border-amber-deep focus:outline-none focus:ring-[3px] focus:ring-amber/15"
      />
      {isJob && jobProfileEmpty && (
        <button
          type="button"
          onClick={() => chrome.runtime.openOptionsPage()}
          class="flex items-start gap-2 rounded-control border border-dashed border-amber-deep/50 bg-amber-soft/10 px-[11px] py-2 text-left text-[11.5px] leading-snug text-mute transition-colors hover:bg-amber-soft/20"
        >
          <Briefcase size={13} class="mt-0.5 shrink-0 text-amber-deep" />
          <span>
            Add your CV and answers in{" "}
            <span class="font-semibold text-amber-deep">Options → Jobs</span> for
            better drafts.
          </span>
        </button>
      )}
      <div class="flex items-stretch gap-2">
        <Segmented
          items={durationItems}
          value={duration}
          onChange={(next) => setSelected(next)}
          size="sm"
          class="h-9 font-mono text-[12px]"
        />
        <Button
          variant="primary"
          onClick={handleStart}
          class="h-9 inline-flex whitespace-nowrap min-h-8 px-3.5 text-xs w-full"
        >
          {isJob ? (
            <Briefcase size={13} strokeWidth={1.8} />
          ) : (
            <Play size={13} strokeWidth={1.8} />
          )}
          {`Start ${duration}-min ${isJob ? "job " : ""}session`}
        </Button>
      </div>
    </div>
  )
}
