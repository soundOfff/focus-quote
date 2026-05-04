import { Effect } from "effect"
import type { StorageService } from "../services/storage"
import type { Theme } from "./schema"

export const THEME_KEY = "focusquote.theme"
export const TODAY_GOAL_KEY = "focusquote.todayGoal"

export const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", theme === "dark")
}

export const loadTheme = (storage: StorageService) =>
  Effect.gen(function* () {
    const stored = yield* storage.get<Theme>(THEME_KEY)
    return (stored ?? "dark") as Theme
  })

export const saveTheme = (storage: StorageService, theme: Theme) =>
  storage.set(THEME_KEY, theme)
