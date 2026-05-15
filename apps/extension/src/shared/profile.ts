import { Effect, Schema } from "effect"
import type { StorageService } from "../services/storage"

export const PROFILE_PREFS_KEY = "focusquote.profilePrefs"

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
