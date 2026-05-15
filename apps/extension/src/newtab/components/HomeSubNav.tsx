const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

export type HomeMainTab =
  | "overview"
  | "sessions"
  | "quotes"
  | "topics"
  | "archive"

const tabs: ReadonlyArray<{ value: HomeMainTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "sessions", label: "Sessions" },
  { value: "quotes", label: "Quotes" },
  { value: "topics", label: "Topics" },
  { value: "archive", label: "Archive" },
]

export function HomeSubNav({
  value,
  onChange,
}: {
  value: HomeMainTab
  onChange: (v: HomeMainTab) => void
}) {
  return (
    <nav
      class="-mb-px flex flex-wrap gap-x-6 gap-y-1 border-b border-hairline-soft"
      aria-label="Home sections"
    >
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            class={cx(
              "pb-2.5 text-xs font-semibold tracking-tight transition-[border-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              active
                ? "border-b-[3px] border-ink text-ink"
                : "border-b-[3px] border-transparent text-mute hover:border-hairline hover:text-body",
            )}
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
