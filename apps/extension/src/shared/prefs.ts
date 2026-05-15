import { Effect, Schema } from "effect"
import type { StorageService } from "../services/storage"
import { Theme } from "@focus-quote/shared"
import { isValidTranslateFrom, isValidTranslateTo } from "./translation"

export const PREFS_KEY = "focusquote.prefs"
const THEME_POLARITY_MIGRATION_KEY = "focusquote.themePolarityMigrated.v1"

export const Prefs = Schema.Struct({
  theme: Theme,
  defaultDurationMinutes: Schema.Number.pipe(Schema.between(1, 180)),
  defaultBreakMinutes: Schema.Number.pipe(Schema.between(0, 60)),
  translateFromLang: Schema.String,
  translateToLang: Schema.String,
})
export type Prefs = Schema.Schema.Type<typeof Prefs>

export const defaultPrefs: Prefs = {
  theme: "dark",
  defaultDurationMinutes: 25,
  defaultBreakMinutes: 5,
  translateFromLang: "auto",
  translateToLang: "en",
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

const parseTheme = (value: unknown): Prefs["theme"] =>
  value === "light" || value === "dark" ? value : defaultPrefs.theme

const parseTranslateFrom = (value: unknown): string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  isValidTranslateFrom(value.trim().toLowerCase())
    ? value.trim().toLowerCase()
    : defaultPrefs.translateFromLang

const parseTranslateTo = (value: unknown): string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  isValidTranslateTo(value.trim().toLowerCase())
    ? value.trim().toLowerCase()
    : defaultPrefs.translateToLang

const normalizePrefs = (raw: unknown): Prefs => {
  if (!raw || typeof raw !== "object") return defaultPrefs
  const input = raw as Record<string, unknown>
  return {
    theme: parseTheme(input.theme),
    defaultDurationMinutes: clampInt(
      input.defaultDurationMinutes,
      1,
      180,
      defaultPrefs.defaultDurationMinutes,
    ),
    defaultBreakMinutes: clampInt(
      input.defaultBreakMinutes,
      0,
      60,
      defaultPrefs.defaultBreakMinutes,
    ),
    translateFromLang: parseTranslateFrom(input.translateFromLang),
    translateToLang: parseTranslateTo(input.translateToLang),
  }
}

export const loadPrefs = (storage: StorageService): Effect.Effect<Prefs> =>
  Effect.gen(function* () {
    const raw = yield* storage
      .get<unknown>(PREFS_KEY)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))
    if (raw === null) return defaultPrefs
    const parsed = normalizePrefs(raw)

    const migrated = yield* storage
      .get<boolean>(THEME_POLARITY_MIGRATION_KEY)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))

    if (migrated === true) return parsed

    const flipped: Prefs = {
      ...parsed,
      theme: parsed.theme === "dark" ? "light" : "dark",
    }

    yield* storage.set(PREFS_KEY, flipped).pipe(Effect.catchAll(() => Effect.void))
    yield* storage
      .set(THEME_POLARITY_MIGRATION_KEY, true)
      .pipe(Effect.catchAll(() => Effect.void))

    return flipped
  })

export const savePrefs = (
  storage: StorageService,
  next: Prefs,
): Effect.Effect<void, never> =>
  storage
    .set(PREFS_KEY, normalizePrefs(next))
    .pipe(Effect.catchAll(() => Effect.void))
