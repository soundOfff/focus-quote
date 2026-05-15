import { Effect, Schema } from "effect"
import type { StorageService } from "../services/storage"
import { ApiService } from "../services/api"
import {
  REMOTE_MIGRATION_FLAGS,
  isMigrated,
  markMigrated,
} from "./remote-migration"

export const PROFILE_PREFS_KEY = "focusquote.profilePrefs"
const PROFILE_REMOTE_MIGRATED_KEY = REMOTE_MIGRATION_FLAGS.profile

export const ProfilePrefs = Schema.Struct({
  displayName: Schema.String,
  photoMediaFileId: Schema.String,
  photoDataUrl: Schema.String,
  headline: Schema.String,
})
export type ProfilePrefs = Schema.Schema.Type<typeof ProfilePrefs>

export const defaultProfilePrefs: ProfilePrefs = {
  displayName: "",
  photoMediaFileId: "",
  photoDataUrl: "",
  headline: "",
}

const HTTP_URL_RE = /^https?:\/\//i

const normalizeImageSrc = (value: string | null | undefined): string => {
  const src = typeof value === "string" ? value.trim() : ""
  if (!src) return ""
  if (src.startsWith("data:image/")) return src
  if (src.startsWith("blob:")) return src
  if (HTTP_URL_RE.test(src)) return src
  return ""
}

export const resolveAccountImageSrc = (
  profilePhotoDataUrl: string | null | undefined,
  userImage: string | null | undefined,
): string => normalizeImageSrc(profilePhotoDataUrl) || normalizeImageSrc(userImage)

const normalize = (raw: unknown): ProfilePrefs => {
  if (!raw || typeof raw !== "object") return defaultProfilePrefs
  const input = raw as Record<string, unknown>
  const clean = (value: unknown, max: number) =>
    typeof value === "string" ? value.trim().slice(0, max) : ""
  return {
    displayName: clean(input.displayName, 80),
    photoMediaFileId: clean(input.photoMediaFileId, 120),
    photoDataUrl:
      clean(input.photoDataUrl, 2_000_000) ||
      // Backward compatibility for old `photoUrl` field.
      clean(input.photoUrl, 2_000_000),
    headline: clean(input.headline, 160),
  }
}

export const loadProfilePrefs = (
  storage: StorageService,
): Effect.Effect<ProfilePrefs> =>
  Effect.gen(function* () {
    const raw = yield* storage
      .get<unknown>(PROFILE_PREFS_KEY)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))
    return normalize(raw)
  })

export const saveProfilePrefs = (
  storage: StorageService,
  next: ProfilePrefs,
): Effect.Effect<void, never> =>
  storage
    .set(PROFILE_PREFS_KEY, normalize(next))
    .pipe(Effect.catchAll(() => Effect.void))

/**
 * Pull profile text fields from the server and merge into local cache.
 * Photo metadata is resolved through `/api/media/:id` separately by the
 * popup/options shells (kept as-is so we don't bloat this module).
 */
export const pullProfileFromRemote = (
  storage: StorageService,
): Effect.Effect<ProfilePrefs, never, ApiService> =>
  Effect.gen(function* () {
    const api = yield* ApiService
    const fallback = yield* loadProfilePrefs(storage)
    const res = yield* Effect.either(api.getProfile())
    if (res._tag === "Left") return fallback
    const p = res.right.profile
    const next: ProfilePrefs = {
      displayName: p.displayName,
      headline: p.headline,
      photoMediaFileId: p.photoMediaFileId ?? fallback.photoMediaFileId,
      // Keep cached data URL if the photo id matches; otherwise drop and
      // let consumers re-resolve it via /api/media/:id.
      photoDataUrl:
        (p.photoMediaFileId ?? "") === fallback.photoMediaFileId
          ? fallback.photoDataUrl
          : "",
    }
    yield* saveProfilePrefs(storage, next)
    return next
  })

export const pushProfileToRemote = (
  next: ProfilePrefs,
): Effect.Effect<void, never, ApiService> =>
  Effect.gen(function* () {
    const api = yield* ApiService
    yield* api
      .putProfile({
        displayName: next.displayName,
        headline: next.headline,
        photoMediaFileId: next.photoMediaFileId || null,
      })
      .pipe(
        Effect.asVoid,
        Effect.catchAll(() => Effect.void),
      )
  })

export const ensureProfileMigrated = (
  storage: StorageService,
): Effect.Effect<void, never, ApiService> =>
  Effect.gen(function* () {
    if (yield* isMigrated(storage, PROFILE_REMOTE_MIGRATED_KEY)) return
    const api = yield* ApiService
    const current = yield* loadProfilePrefs(storage)
    // Skip if there's nothing to migrate yet (display name + headline empty
    // and no photo file id). Server will lazily seed defaults on first read.
    if (!current.displayName && !current.headline && !current.photoMediaFileId) {
      yield* markMigrated(storage, PROFILE_REMOTE_MIGRATED_KEY)
      return
    }
    const res = yield* Effect.either(
      api.putProfile({
        displayName: current.displayName,
        headline: current.headline,
        photoMediaFileId: current.photoMediaFileId || null,
      }),
    )
    if (res._tag === "Right") {
      yield* markMigrated(storage, PROFILE_REMOTE_MIGRATED_KEY)
    }
  })
