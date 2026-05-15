import { Effect, Schema } from "effect"
import type { StorageService } from "../services/storage"
import { ApiService } from "../services/api"
import { Theme } from "@focus-quote/shared"
import { isValidTranslateFrom, isValidTranslateTo } from "./translation"
import {
  REMOTE_MIGRATION_FLAGS,
  isMigrated,
  markMigrated,
} from "./remote-migration"

export const PREFS_KEY = "focusquote.prefs"
const THEME_POLARITY_MIGRATION_KEY = "focusquote.themePolarityMigrated.v1"
const PREFS_REMOTE_MIGRATED_KEY = REMOTE_MIGRATION_FLAGS.prefs

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

/**
 * Remote-first sync helpers. The server `/api/settings` row is the source of
 * truth for prefs across devices; `chrome.storage.local` keeps a fast local
 * cache so UI never blocks on the network. One-time migration uploads
 * pre-existing local prefs the first time a signed-in user loads the
 * extension on a given device.
 */

export interface PrefsRemoteExtras {
  todayGoal?: string | null
  debugOverlayEnabled?: boolean
  notificationsBlocked?: boolean
  toolbarSide?: "left" | "right"
}

const settingsPayload = (prefs: Prefs, extras: PrefsRemoteExtras = {}) => ({
  theme: prefs.theme,
  defaultDurationMinutes: prefs.defaultDurationMinutes,
  defaultBreakMinutes: prefs.defaultBreakMinutes,
  translateFromLang: prefs.translateFromLang,
  translateToLang: prefs.translateToLang,
  ...(extras.todayGoal !== undefined ? { todayGoal: extras.todayGoal } : {}),
  ...(extras.debugOverlayEnabled !== undefined
    ? { debugOverlayEnabled: extras.debugOverlayEnabled }
    : {}),
  ...(extras.notificationsBlocked !== undefined
    ? { notificationsBlocked: extras.notificationsBlocked }
    : {}),
  ...(extras.toolbarSide !== undefined
    ? { toolbarSide: extras.toolbarSide }
    : {}),
})

/** Pull prefs from server and persist into local cache. Returns merged Prefs. */
export const pullPrefsFromRemote = (
  storage: StorageService,
): Effect.Effect<Prefs, never, ApiService> =>
  Effect.gen(function* () {
    const api = yield* ApiService
    const fallback = yield* loadPrefs(storage)
    const res = yield* Effect.either(api.getSettings())
    if (res._tag === "Left") return fallback
    const s = res.right.settings
    const next: Prefs = normalizePrefs({
      theme: s.theme,
      defaultDurationMinutes: s.defaultDurationMinutes,
      defaultBreakMinutes: s.defaultBreakMinutes,
      translateFromLang: s.translateFromLang,
      translateToLang: s.translateToLang,
    })
    yield* savePrefs(storage, next)
    return next
  })

/** Push prefs (+ optional UI extras already known on this device) to server. */
export const pushPrefsToRemote = (
  prefs: Prefs,
  extras: PrefsRemoteExtras = {},
): Effect.Effect<void, never, ApiService> =>
  Effect.gen(function* () {
    const api = yield* ApiService
    yield* api
      .putSettings(settingsPayload(prefs, extras))
      .pipe(
        Effect.asVoid,
        Effect.catchAll(() => Effect.void),
      )
  })

/**
 * One-time client-side migration: if we have local prefs but haven't yet
 * uploaded them, push them now and mark the flag. Idempotent and silent on
 * network failure (caller can re-attempt on next load).
 */
export const ensurePrefsMigrated = (
  storage: StorageService,
): Effect.Effect<void, never, ApiService> =>
  Effect.gen(function* () {
    if (yield* isMigrated(storage, PREFS_REMOTE_MIGRATED_KEY)) return
    const api = yield* ApiService
    const prefs = yield* loadPrefs(storage)
    const res = yield* Effect.either(api.putSettings(settingsPayload(prefs)))
    if (res._tag === "Right") {
      yield* markMigrated(storage, PREFS_REMOTE_MIGRATED_KEY)
    }
  })
