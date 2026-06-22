import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import { Check, Play, Plus, Square, Timer } from "lucide-preact"
import { SessionsService, type ActiveSession } from "../../services/sessions"
import { ApiService } from "../../services/api"
import type { SessionStartMessage } from "../../shared/messages"
import type { Topic } from "@focus-quote/shared"
import { runP } from "../runtime"
import {
  Button,
  MonoLabel,
  Segmented,
  type SegmentedItem,
} from "../../ui/primitives"
import { Dropdown, type DropdownOption } from "../../ui/Dropdown"

const NEW_TOPIC = "__new__"

// Topics are server-backed; the popup only renders this panel for signed-in
// users (guests see SessionLockedCard), so listing/creating is always allowed.
const loadTopics = Effect.gen(function* () {
  const api = yield* ApiService
  const res = yield* api
    .listTopics()
    .pipe(Effect.catchAll(() => Effect.succeed({ topics: [] as Topic[] })))
  return res.topics
})

const createTopicEff = (name: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    return yield* api.createTopic(name)
  })

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
  const [topics, setTopics] = useState<ReadonlyArray<Topic>>([])
  const [topicId, setTopicId] = useState("")
  // "create" swaps the topic <select> for a name input. Forced on when the user
  // has no topics yet (there is nothing to pick).
  const [topicMode, setTopicMode] = useState<"pick" | "create">("pick")
  const [newTopic, setNewTopic] = useState("")
  const [creatingTopic, setCreatingTopic] = useState(false)
  const [topicError, setTopicError] = useState<string | null>(null)

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

  // Load the user's topics once so they can file the session before it starts.
  // Default to the first (most-recently-used) topic; with none yet, drop into
  // create mode so the only path forward is naming a new one.
  useEffect(() => {
    runP(loadTopics)
      .then((list) => {
        setTopics(list)
        const first = list[0]
        if (first) {
          setTopicId((cur) => cur || first.id)
          setTopicMode("pick")
        } else {
          setTopicMode("create")
        }
      })
      .catch(() => setTopics([]))
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

  // Both a title and a filed Topic are required before a session can start.
  const title = goal.trim()
  const canStart = title.length > 0 && topicId.length > 0

  // Resolve the running session's Topic id to a display name (best-effort —
  // null while topics are still loading or if it isn't in the list).
  const activeTopicName = useMemo(() => {
    if (!active?.topicId) return null
    return topics.find((t) => t.id === active.topicId)?.name ?? null
  }, [active, topics])

  // Options for the topic <Dropdown>: the user's topics plus a trailing entry
  // that swaps the picker for the create-name input.
  const topicOptions = useMemo<ReadonlyArray<DropdownOption<string>>>(
    () => [
      ...topics.map((t) => ({ value: t.id, label: t.name })),
      { value: NEW_TOPIC, label: "+ New topic…" },
    ],
    [topics],
  )

  const handleStart = () => {
    if (!canStart) return
    const payload: SessionStartMessage = {
      type: "focusquote.session.start",
      durationMinutes: Math.max(1, Math.min(180, Math.floor(duration))),
      breakMinutes: Math.max(0, Math.min(60, Math.floor(defaultBreakMinutes))),
      goal: title,
      topicId,
    }
    chrome.runtime
      .sendMessage(payload)
      .then(() => {
        refresh()
        onChange?.()
      })
      .catch((err) => console.error("[FocusQuote] start session:", err))
  }

  const handleCreateTopic = () => {
    const name = newTopic.trim()
    if (!name || creatingTopic) return
    setCreatingTopic(true)
    setTopicError(null)
    runP(createTopicEff(name))
      .then(({ topic }) => {
        setTopics((prev) => [topic, ...prev.filter((t) => t.id !== topic.id)])
        setTopicId(topic.id)
        setTopicMode("pick")
        setNewTopic("")
      })
      .catch(() => setTopicError("Couldn't create topic — check your connection."))
      .finally(() => setCreatingTopic(false))
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

  // Finish (complete): ends the session as completed=true and runs the full
  // completion pipeline — distinct from Stop, which cancels (completed=false).
  const handleFinish = () => {
    chrome.runtime
      .sendMessage({ type: "focusquote.session.finish" })
      .then(() => {
        refresh()
        onChange?.()
      })
      .catch((err) => console.error("[FocusQuote] finish session:", err))
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
                {activeTopicName ? (
                  <span class="text-muted-2"> · {activeTopicName}</span>
                ) : null}
              </div>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <Button variant="primary" size="sm" onClick={handleFinish}>
              <Check size={11} strokeWidth={2.2} />
              Finish
            </Button>
            <Button variant="ghost" size="sm" onClick={handleStop}>
              <Square size={11} strokeWidth={2} />
              Stop
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-[10px]">
      <MonoLabel>Focus session</MonoLabel>
      <input
        type="text"
        placeholder="Session title — what are you focusing on?"
        value={goal}
        onInput={(e) => setGoal((e.currentTarget as HTMLInputElement).value)}
        class="rounded-control border border-rule-2 bg-paper-2 px-[11px] py-[9px] text-[13px] text-ink placeholder:text-muted-2 focus:border-amber-deep focus:outline-none focus:ring-[3px] focus:ring-amber/15"
      />
      {topicMode === "pick" ? (
        <Dropdown
          value={topicId}
          onChange={(value) => {
            if (value === NEW_TOPIC) {
              setTopicError(null)
              setTopicMode("create")
            } else {
              setTopicId(value)
            }
          }}
          ariaLabel="Topic"
          options={topicOptions}
          placeholder="Choose a topic"
          triggerClass="rounded-control border border-rule-2 bg-paper-2 px-[11px] py-[9px] text-[13px] text-ink aria-expanded:border-amber-deep"
        />
      ) : (
        <div class="flex flex-col gap-1">
          <div class="flex items-stretch gap-2">
            <input
              type="text"
              placeholder="New topic name"
              value={newTopic}
              onInput={(e) =>
                setNewTopic((e.currentTarget as HTMLInputElement).value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateTopic()
              }}
              class="min-w-0 flex-1 rounded-control border border-rule-2 bg-paper-2 px-[11px] py-[9px] text-[13px] text-ink placeholder:text-muted-2 focus:border-amber-deep focus:outline-none focus:ring-[3px] focus:ring-amber/15"
            />
            <Button
              variant="secondary"
              onClick={handleCreateTopic}
              disabled={!newTopic.trim() || creatingTopic}
              class="h-auto whitespace-nowrap px-3 text-xs"
            >
              <Plus size={13} strokeWidth={1.8} />
              {creatingTopic ? "Adding…" : "Add"}
            </Button>
            {topics.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setTopicMode("pick")
                  setNewTopic("")
                  setTopicError(null)
                }}
                class="h-auto whitespace-nowrap px-2.5 text-xs"
              >
                Cancel
              </Button>
            )}
          </div>
          {topicError && (
            <p class="px-0.5 text-[11px] text-red-500">{topicError}</p>
          )}
        </div>
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
          disabled={!canStart}
          class="h-9 inline-flex whitespace-nowrap min-h-8 px-3.5 text-xs w-full"
        >
          <Play size={13} strokeWidth={1.8} />
          Start {duration}-min session
        </Button>
      </div>
    </div>
  )
}
