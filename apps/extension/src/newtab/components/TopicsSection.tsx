import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import { Layers, Timer } from "lucide-preact"
import { ApiService } from "../../services/api"
import { runP } from "../runtime"
import type { Topic } from "@focus-quote/shared"
import { SectionHeader, Surface } from "../../ui/primitives"

const loadTopics = Effect.gen(function* () {
  const api = yield* ApiService
  const res = yield* api
    .listTopics()
    .pipe(Effect.catchAll(() => Effect.succeed({ topics: [] as Topic[] })))
  return res.topics
})

const fmtHours = (ms: number): string => {
  if (ms < 60_000) return "<1m"
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  const hours = ms / 3_600_000
  if (hours < 10) return `${hours.toFixed(1)}h`
  return `${Math.round(hours)}h`
}

const fmtRelative = (iso: string): string => {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = now - then
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  const days = Math.round(diff / 86_400_000)
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.round(days / 7)}w ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function TopicsSection() {
  const [topics, setTopics] = useState<ReadonlyArray<Topic>>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    runP(loadTopics)
      .then((t) => {
        setTopics(t)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  const visibleTopics = useMemo(() => topics.slice(0, 9), [topics])

  if (!ready) return null
  if (topics.length === 0) return null

  return (
    <section class="flex flex-col gap-3">
      <SectionHeader
        title="Topics"
        icon={<Layers size={14} class="text-mute" />}
      />
      <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
        {visibleTopics.map((t) => (
          <Surface key={t.name} class="p-3">
            <div class="mb-1 truncate text-sm font-medium text-ink" title={t.name}>
              {t.name}
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-mute">
              <span class="tabular-nums">
                {t.sessionCount} session{t.sessionCount === 1 ? "" : "s"}
              </span>
              <span class="inline-flex items-center gap-0.5 tabular-nums">
                <Timer size={10} /> {fmtHours(t.totalActualMs)}
              </span>
              <span class="tabular-nums">{fmtRelative(t.lastUsedAt)}</span>
            </div>
          </Surface>
        ))}
      </div>
    </section>
  )
}
