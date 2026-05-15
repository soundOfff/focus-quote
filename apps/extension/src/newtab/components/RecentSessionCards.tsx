import { ChevronRight } from "lucide-preact"
import type { Session } from "@focus-quote/shared"
import { Badge } from "../../ui/primitives"
import { navigateTo } from "../router"

const fmtMinutesShort = (ms: number): string => {
  if (ms < 60_000) return `${Math.round(ms / 1000)} SEC`
  const min = Math.round(ms / 60_000)
  return `${min} MIN`
}

const derive = (s: Session) => {
  const plannedMs = s.durationMinutes * 60_000
  if (!s.endedAt) {
    return {
      plannedMs,
      status: "running" as const,
      blurb: "In progress — end from the toolbar when you wrap up.",
    }
  }
  const actualMs = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
  if (s.completed) {
    return {
      plannedMs,
      actualMs,
      status: "completed" as const,
      blurb:
        "Session finished — open the full report for the AI summary and tips.",
    }
  }
  return {
    plannedMs,
    actualMs,
    status: "canceled" as const,
    blurb:
      "Ended early before the planned block finished — every block still counts toward momentum.",
  }
}

export function RecentSessionCards({
  sessions,
  limit = 4,
}: {
  sessions: ReadonlyArray<Session>
  limit?: number
}) {
  const rows = sessions.slice(0, limit)

  return (
    <ul class="flex flex-col gap-2">
      {rows.map((session) => {
        const d = derive(session)
        const statusBadge =
          d.status === "completed" ? (
            <Badge tone="success">Completed</Badge>
          ) : d.status === "running" ? (
            <Badge tone="neutral">Paused</Badge>
          ) : (
            <Badge tone="danger">Canceled</Badge>
          )
        return (
          <li key={session.id}>
            <button
              type="button"
              onClick={() => navigateTo(`/session/${session.id}`)}
              class="flex w-full items-stretch gap-0 overflow-hidden rounded-md border border-hairline bg-surface text-left transition-[background-color,transform] duration-150 ease-out hover:bg-surface-doc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70 motion-reduce:transition-none active:scale-[0.99] motion-reduce:active:scale-100"
            >
              <div class="flex w-[4.25rem] shrink-0 flex-col items-center justify-center border-r border-hairline-soft bg-surface-doc py-3 text-center dark:bg-surface-soft/40">
                <span class="text-[10px] font-semibold uppercase leading-tight tracking-wide text-mute">
                  {fmtMinutesShort(d.plannedMs)}
                </span>
              </div>
              <div class="flex min-w-0 flex-1 flex-col gap-1 px-3 py-3 pr-2">
                <span class="truncate text-sm font-semibold text-ink">
                  {session.goal || "Session without a goal"}
                </span>
                <p class="line-clamp-2 text-xs leading-relaxed text-mute">
                  {d.blurb}
                </p>
              </div>
              <div class="flex w-[10em] shrink-0 flex-row items-center justify-center gap-2 border-l border-hairline-soft dark:border-hairline-soft bg-surface-doc">
                {statusBadge}
                <ChevronRight size={16} class="text-mute" aria-hidden />
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
