import { Effect, Schema } from "effect"
import type { StorageService } from "../services/storage"
import { Theme } from "@focus-quote/shared"

export const PREFS_KEY = "focusquote.prefs"
const THEME_POLARITY_MIGRATION_KEY = "focusquote.themePolarityMigrated.v1"

export const Prefs = Schema.Struct({
  theme: Theme,
  defaultDurationMinutes: Schema.Number.pipe(Schema.between(1, 180)),
  defaultBreakMinutes: Schema.Number.pipe(Schema.between(0, 60)),
})
export type Prefs = Schema.Schema.Type<typeof Prefs>

export const defaultPrefs: Prefs = {
  theme: "dark",
  defaultDurationMinutes: 25,
  defaultBreakMinutes: 5,
}

export const loadPrefs = (storage: StorageService): Effect.Effect<Prefs> =>
  Effect.gen(function* () {
    const raw = yield* storage
      .get<unknown>(PREFS_KEY)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))
    if (raw === null) return defaultPrefs
    const parsed = yield* Schema.decodeUnknown(Prefs)(raw).pipe(
      Effect.catchAll(() => Effect.succeed(defaultPrefs)),
    )

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
    .set(PREFS_KEY, next)
    .pipe(Effect.catchAll(() => Effect.void))
