import { Effect } from "effect"
import type { StorageService } from "../services/storage"
import type { Theme } from "./schema"
import { loadPrefs, savePrefs } from "./prefs"

export const TODAY_GOAL_KEY = "focusquote.todayGoal"

export const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", theme === "dark")
}

export const loadTheme = (storage: StorageService) =>
  loadPrefs(storage).pipe(Effect.map((p) => p.theme))

export const saveTheme = (storage: StorageService, theme: Theme) =>
  loadPrefs(storage).pipe(
    Effect.flatMap((p) => savePrefs(storage, { ...p, theme })),
  )
