import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import { Play, Square, Timer } from "lucide-preact"
import { SessionsService, type ActiveSession } from "../../services/sessions"
import type { SessionStartMessage } from "../../shared/messages"
import { runP } from "../runtime"

const formatRemaining = (expectedEndAt: string) => {
  const ms = new Date(expectedEndAt).getTime() - Date.now()
  if (ms <= 0) return "0:00"
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

interface Props {
  onChange?: () => void
}

export function SessionPanel({ onChange }: Props) {
  const [active, setActive] = useState<ActiveSession | null>(null)
  const [goal, setGoal] = useState("")
  const [duration, setDuration] = useState(25)
  const [remaining, setRemaining] = useState("")

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
      breakMinutes: 5,
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
      <div class="rounded bg-card-dark p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <Timer size={16} class="text-accent" />
            <div class="min-w-0">
              <div class="text-base font-medium tabular-nums">{remaining}</div>
              <div class="truncate text-xs opacity-60">
                {active.goal ?? "Focusing…"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStop}
            class="flex items-center gap-1 rounded border border-accent/40 px-2 py-1 text-xs text-accent transition hover:bg-accent/10"
          >
            <Square size={12} />
            Stop
          </button>
        </div>
      </div>
    )
  }

  return (
    <div class="rounded bg-card-dark p-3">
      <div class="flex items-center gap-2">
        <input
          type="text"
          placeholder="Goal for this session…"
          value={goal}
          onInput={(e) => setGoal((e.currentTarget as HTMLInputElement).value)}
          class="flex-1 rounded bg-bg-dark/60 px-2 py-1.5 text-sm placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <input
          type="number"
          min={1}
          max={180}
          value={duration}
          onInput={(e) =>
            setDuration(Number((e.currentTarget as HTMLInputElement).value))
          }
          class="w-14 rounded bg-bg-dark/60 px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <button
        type="button"
        onClick={handleStart}
        class="mt-2 flex w-full items-center justify-center gap-2 rounded bg-accent py-2 text-sm font-medium text-white transition hover:bg-accent/90"
      >
        <Play size={14} />
        Start focus session
      </button>
    </div>
  )
}
