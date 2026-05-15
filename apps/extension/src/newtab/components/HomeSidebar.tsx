import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import { Bookmark, Clock, Flame, Layers } from "lucide-preact"
import { ApiService } from "../../services/api"
import { runP } from "../runtime"
import type { Topic } from "@focus-quote/shared"

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

const loadTopics = Effect.gen(function* () {
  const api = yield* ApiService
  const res = yield* api
    .listTopics()
    .pipe(Effect.catchAll(() => Effect.succeed({ topics: [] as Topic[] })))
  return res.topics
})

interface Metrics {
  todaySessions: number
  streak: number
  totalQuotes: number
}

export function HomeSidebar({
  metrics,
  onJumpToTopics,
}: {
  metrics: Metrics
  onJumpToTopics: () => void
}) {
  const [topics, setTopics] = useState<ReadonlyArray<Topic>>([])
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)

  useEffect(() => {
    runP(loadTopics)
      .then((t) => {
        setTopics(t)
        if (t[0]) setSelectedTopic(t[0].name)
      })
      .catch(() => {})
  }, [])

  const visibleTopics = useMemo(() => topics.slice(0, 8), [topics])

  return (
    <aside class="flex w-full shrink-0 flex-col gap-8 lg:w-56">
      <div>
        <h2 class="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">
          Metrics
        </h2>
        <ul class="flex flex-col gap-2">
          <li>
            <div class="rounded-md border border-hairline bg-surface px-3 py-3">
              <div class="mb-1 flex items-center gap-1.5 text-mute">
                <Clock size={14} class="text-primary" strokeWidth={2} />
                <span class="text-[10px] font-medium uppercase tracking-wide">
                  Sessions today
                </span>
              </div>
              <p class="text-2xl font-bold tabular-nums tracking-tight text-ink">
                {String(metrics.todaySessions).padStart(2, "0")}
              </p>
            </div>
          </li>
          <li>
            <div class="rounded-md border border-hairline bg-surface px-3 py-3">
              <div class="mb-1 flex items-center gap-1.5 text-mute">
                <Flame size={14} class="text-primary" strokeWidth={2} />
                <span class="text-[10px] font-medium uppercase tracking-wide">
                  Day streak
                </span>
              </div>
              <p class="text-2xl font-bold tabular-nums tracking-tight text-ink">
                {String(metrics.streak).padStart(2, "0")}
              </p>
            </div>
          </li>
          <li>
            <div class="rounded-md border border-hairline bg-surface px-3 py-3">
              <div class="mb-1 flex items-center gap-1.5 text-mute">
                <Bookmark size={14} class="text-primary" strokeWidth={2} />
                <span class="text-[10px] font-medium uppercase tracking-wide">
                  Quotes saved
                </span>
              </div>
              <p class="text-2xl font-bold tabular-nums tracking-tight text-ink">
                {String(metrics.totalQuotes).padStart(2, "0")}
              </p>
            </div>
          </li>
        </ul>
      </div>

      {visibleTopics.length > 0 && (
        <div>
          <div class="mb-3 flex items-center gap-1.5">
            <Layers size={14} class="text-mute" />
            <h2 class="text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">
              Active topics
            </h2>
          </div>
          <ul class="flex flex-col gap-0.5">
            {visibleTopics.map((t) => {
              const active = selectedTopic === t.name
              return (
                <li key={t.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTopic(t.name)
                      onJumpToTopics()
                    }}
                    class={cx(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70",
                      active
                        ? "bg-surface-soft font-medium text-ink"
                        : "text-body hover:bg-surface-doc",
                    )}
                  >
                    <span class="min-w-0 truncate">{t.name}</span>
                    <span class="shrink-0 tabular-nums text-xs text-mute">
                      {String(t.sessionCount).padStart(2, "0")}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </aside>
  )
}
