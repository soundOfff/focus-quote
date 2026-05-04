import { Flame, Quote, Timer } from "lucide-preact"

interface Props {
  todaySessions: number
  streak: number
  totalQuotes: number
}

export function StatsRow({ todaySessions, streak, totalQuotes }: Props) {
  const items = [
    {
      icon: <Timer size={18} class="text-accent" />,
      label: "Sessions today",
      value: todaySessions,
    },
    {
      icon: <Flame size={18} class="text-accent" />,
      label: "Day streak",
      value: streak,
    },
    {
      icon: <Quote size={18} class="text-accent" />,
      label: "Quotes saved",
      value: totalQuotes,
    },
  ]
  return (
    <div class="grid grid-cols-3 gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          class="flex flex-col items-start gap-1 rounded bg-card-light p-4 shadow-sm dark:bg-card-dark/40 dark:shadow-none"
        >
          {it.icon}
          <div class="text-2xl font-semibold tabular-nums">{it.value}</div>
          <div class="text-xs uppercase tracking-wide opacity-60">
            {it.label}
          </div>
        </div>
      ))}
    </div>
  )
}
