import { useEffect, useState } from "preact/hooks"
import { Pencil } from "lucide-preact"
import { useDebounce } from "../../shared/use-debounce"

interface Props {
  goal: string
  onChange: (value: string) => void
}

export function GoalEditor({ goal, onChange }: Props) {
  const [value, setValue] = useState(goal)
  const debouncedOnChange = useDebounce((next: string) => onChange(next), 300)

  useEffect(() => {
    setValue(goal)
  }, [goal])

  const focusInput = () => {
    const el = document.getElementById("fq-today-intent-input")
    el?.focus()
  }

  return (
    <div class="relative rounded-md border border-hairline-soft bg-accent-blue-soft px-4 py-3 dark:border-hairline dark:bg-accent-blue-soft/35">
      <div class="mb-2 flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-link-blue/25 bg-surface text-link-blue dark:border-link-blue/40 dark:bg-surface/80"
            aria-hidden
          >
            <span class="h-2 w-2 rounded-full bg-link-blue" />
          </span>
          <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-link-blue dark:text-link-blue">
            Today&apos;s intent
          </span>
        </div>
        <button
          type="button"
          onClick={focusInput}
          aria-label="Edit today’s intent"
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-mute transition-[background-color,color,transform] hover:bg-surface/80 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-surface/50"
        >
          <Pencil size={14} strokeWidth={2} />
        </button>
      </div>
      <input
        id="fq-today-intent-input"
        type="text"
        placeholder="What deserves your deepest focus today?"
        value={value}
        onInput={(e) => {
          const next = (e.currentTarget as HTMLInputElement).value
          setValue(next)
          debouncedOnChange(next)
        }}
        class="w-full bg-transparent text-sm font-bold leading-snug text-ink placeholder:font-medium placeholder:text-mute/70 focus:outline-none"
      />
    </div>
  )
}
