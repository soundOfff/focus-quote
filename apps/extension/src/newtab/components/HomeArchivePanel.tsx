import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import type { Session } from "@focus-quote/shared"
import { SessionsService } from "../../services/sessions"
import { runP } from "../runtime"
import { SessionCard } from "./SessionsSection"
import { EmptyState } from "../../ui/primitives"

const loadSessions = (limit: number) =>
  Effect.gen(function* () {
    const sessions = yield* SessionsService
    return yield* sessions.list(limit)
  })

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

export function HomeArchivePanel() {
  const [sessions, setSessions] = useState<ReadonlyArray<Session>>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    runP(loadSessions(80))
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setReady(true))
  }, [])

  const archived = useMemo(
    () => sessions.filter((s) => dayBucket(s.startedAt) === "older"),
    [sessions],
  )

  if (!ready) return null
  if (archived.length === 0) {
    return (
      <EmptyState
        title="Archive is empty"
        description="Older sessions (beyond the last week) show up here for deep review."
      />
    )
  }

  return (
    <div class="flex flex-col gap-2">
      {archived.map((s) => (
        <SessionCard key={s.id} session={s} />
      ))}
    </div>
  )
}
