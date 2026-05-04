import { Effect, Schema } from "effect"
import type { StorageService } from "../services/storage"
import { Theme } from "@focus-quote/shared"

export const PREFS_KEY = "focusquote.prefs"

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
    return yield* Schema.decodeUnknown(Prefs)(raw).pipe(
      Effect.catchAll(() => Effect.succeed(defaultPrefs)),
    )
  })

export const savePrefs = (
  storage: StorageService,
  next: Prefs,
): Effect.Effect<void, never> =>
  storage
    .set(PREFS_KEY, next)
    .pipe(Effect.catchAll(() => Effect.void))
