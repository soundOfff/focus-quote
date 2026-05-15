import { Effect } from "effect"
import type { StorageService } from "../services/storage"
import { ApiService } from "../services/api"
import type { Theme } from "@focus-quote/shared"
import { loadPrefs, pushPrefsToRemote, savePrefs } from "./prefs"

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

/**
 * Today's focus goal. Persists locally for fast paint and mirrors the change
 * onto `/api/settings.today_goal` so it follows the user across devices.
 */
export const loadTodayGoal = (storage: StorageService): Effect.Effect<string> =>
  storage.get<string>(TODAY_GOAL_KEY).pipe(
    Effect.map((v) => v ?? ""),
    Effect.catchAll(() => Effect.succeed("")),
  )

export const saveTodayGoal = (
  storage: StorageService,
  value: string,
): Effect.Effect<void, never, ApiService> =>
  Effect.gen(function* () {
    const trimmed = value
    if (trimmed.trim()) {
      yield* storage.set(TODAY_GOAL_KEY, trimmed).pipe(
        Effect.catchAll(() => Effect.void),
      )
    } else {
      yield* storage.remove(TODAY_GOAL_KEY).pipe(
        Effect.catchAll(() => Effect.void),
      )
    }
    const prefs = yield* loadPrefs(storage)
    yield* pushPrefsToRemote(prefs, {
      todayGoal: trimmed.trim() ? trimmed : null,
    })
  })
