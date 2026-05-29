import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import { Play, Square, Timer } from "lucide-preact"
import { SessionsService, type ActiveSession } from "../../services/sessions"
import type { SessionStartMessage } from "../../shared/messages"
import { runP } from "../runtime"
import {
  Button,
  MonoLabel,
  Segmented,
  type SegmentedItem,
} from "../../ui/primitives"

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
    return (
      <div class="flex flex-col gap-3">
        <MonoLabel>Focus session</MonoLabel>
        <div class="flex items-center justify-between gap-3 rounded-card border border-rule bg-paper-2 px-3 py-[10px]">
          <div class="flex min-w-0 items-center gap-2">
            <Timer
              size={14}
              strokeWidth={1.8}
              class="shrink-0 text-amber-deep"
              aria-hidden
            />
            <div class="min-w-0">
              <div class="font-mono text-[18px] font-medium leading-none tracking-[-0.005em] text-ink">
                {remaining}
              </div>
              <div class="mt-1 truncate text-[11.5px] text-muted">
                {active.goal ?? "Focusing…"}
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

  return (
    <div class="flex flex-col gap-[10px]">
      <MonoLabel>Focus session</MonoLabel>
      <input
        type="text"
        placeholder="What are you focusing on?"
        value={goal}
        onInput={(e) => setGoal((e.currentTarget as HTMLInputElement).value)}
        class="rounded-control border border-rule-2 bg-paper-2 px-[11px] py-[9px] text-[13px] text-ink placeholder:text-muted-2 focus:border-amber-deep focus:outline-none focus:ring-[3px] focus:ring-amber/15"
      />
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
          class="h-9 flex-1 min-h-9 px-3.5 text-[13px]"
        >
          <Play size={13} strokeWidth={1.8} />
          Start {duration}-min session
        </Button>
      </div>
    </div>
  )
}
