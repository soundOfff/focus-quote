import { Effect } from "effect"
import type { StorageService } from "../services/storage"
import { ApiService } from "../services/api"
import type { Theme } from "@focus-quote/shared"
import { loadPrefs, PREFS_KEY, pushPrefsToRemote, savePrefs } from "./prefs"

export const TODAY_GOAL_KEY = "focusquote.todayGoal"

export const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", theme === "dark")
}

/**
 * Cross-context theme sync. Every extension page persists prefs under a single
 * `chrome.storage.local` key, so a change made in one context (e.g. the popup)
 * fires `storage.onChanged` in every other open context. Each root subscribes
 * to re-apply the theme (and refresh its own controls) without a reload.
 *
 * Returns an unsubscribe function for effect cleanup.
 */
export const subscribeThemeChanges = (
  onTheme: (theme: Theme) => void,
): (() => void) => {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
    return () => {}
  }
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local") return
    const change = changes[PREFS_KEY]
    if (!change) return
    const next = (change.newValue as { theme?: unknown } | undefined)?.theme
    if (next === "light" || next === "dark") onTheme(next)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
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
