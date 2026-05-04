import { useEffect, useRef, useState } from "preact/hooks"
import { Target } from "lucide-preact"

interface Props {
  goal: string
  onChange: (value: string) => void
}

export function GoalEditor({ goal, onChange }: Props) {
  const [value, setValue] = useState(goal)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setValue(goal)
  }, [goal])

  useEffect(() => {
    if (value === goal) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onChange(value), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  return (
    <label class="flex items-center gap-3 rounded bg-card-light px-4 py-3 shadow-sm dark:bg-card-dark/40 dark:shadow-none">
      <Target size={18} class="text-accent" />
      <span class="shrink-0 text-xs uppercase tracking-wide opacity-60">
        Today
      </span>
      <input
        type="text"
        placeholder="What's the one thing today?"
        value={value}
        onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)}
        class="flex-1 bg-transparent text-base placeholder:opacity-40 focus:outline-none"
      />
    </label>
  )
}
