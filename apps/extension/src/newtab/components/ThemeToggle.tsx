import { Moon, Sun } from "lucide-preact"
import type { Theme } from "@focus-quote/shared"

interface Props {
  theme: Theme
  onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle theme"
      class="rounded p-2 opacity-60 transition hover:bg-card-light hover:opacity-100 dark:hover:bg-card-dark/40"
    >
      {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  )
}
