import { Effect } from "effect"
import type { StorageService } from "../services/storage"
import { ApiService } from "../services/api"
import {
  REMOTE_MIGRATION_FLAGS,
  isMigrated,
  markMigrated,
} from "./remote-migration"

/**
 * @deprecated The OpenRouter API key has moved to encrypted server storage
 * under `/api/secrets/openrouter`. The local key is now only kept long enough
 * to perform a one-time migration; consumers should call
 * `getOpenrouterKeyState` to know whether a key is configured.
 */
export const OPENROUTER_KEY_KEY = "focusquote.openrouterKey"
const OPENROUTER_REMOTE_MIGRATED_KEY = REMOTE_MIGRATION_FLAGS.openrouter

export interface OpenrouterKeyState {
  /** True iff the server has a secret stored for this user. */
  hasValue: boolean
  /** Masked preview such as "sk-o…wxyz" suitable for display in settings. */
  hint: string | null
  /** ISO timestamp of last server-side update, or null. */
  updatedAt: string | null
}

const emptyState: OpenrouterKeyState = {
  hasValue: false,
  hint: null,
  updatedAt: null,
}

/** Fetch the current secret summary from the server (best-effort). */
export const getOpenrouterKeyState: Effect.Effect<
  OpenrouterKeyState,
  never,
  ApiService
> = Effect.gen(function* () {
  const api = yield* ApiService
  const r = yield* Effect.either(api.getSecret("openrouter"))
  return r._tag === "Right"
    ? {
        hasValue: r.right.secret.hasValue,
        hint: r.right.secret.hint,
        updatedAt: r.right.secret.updatedAt,
      }
    : emptyState
})

export const saveOpenrouterKey = (
  value: string,
): Effect.Effect<OpenrouterKeyState, never, ApiService> =>
  Effect.gen(function* () {
    const api = yield* ApiService
    const r = yield* Effect.either(api.putSecret("openrouter", { value }))
    return r._tag === "Right"
      ? {
          hasValue: r.right.secret.hasValue,
          hint: r.right.secret.hint,
          updatedAt: r.right.secret.updatedAt,
        }
      : emptyState
  })

export const clearOpenrouterKey: Effect.Effect<void, never, ApiService> =
  Effect.gen(function* () {
    const api = yield* ApiService
    yield* api
      .deleteSecret("openrouter")
      .pipe(
        Effect.asVoid,
        Effect.catchAll(() => Effect.void),
      )
  })

/**
 * If we still have a locally-stored OpenRouter key from a pre-migration
 * install, upload it to the server (which encrypts at rest) and wipe the
 * local copy. Silent on network failure so we retry on next load.
 */
export const ensureOpenrouterMigrated = (
  storage: StorageService,
): Effect.Effect<void, never, ApiService> =>
  Effect.gen(function* () {
    if (yield* isMigrated(storage, OPENROUTER_REMOTE_MIGRATED_KEY)) return
    const local = yield* storage
      .get<string>(OPENROUTER_KEY_KEY)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))
    if (!local || typeof local !== "string" || !local.trim()) {
      yield* markMigrated(storage, OPENROUTER_REMOTE_MIGRATED_KEY)
      return
    }
    const api = yield* ApiService
    const res = yield* Effect.either(
      api.putSecret("openrouter", { value: local.trim() }),
    )
    if (res._tag === "Right") {
      yield* storage
        .remove(OPENROUTER_KEY_KEY)
        .pipe(Effect.catchAll(() => Effect.void))
      yield* markMigrated(storage, OPENROUTER_REMOTE_MIGRATED_KEY)
    }
  })
