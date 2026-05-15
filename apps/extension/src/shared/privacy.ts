import { Effect, Schema } from "effect"
import type { StorageService } from "../services/storage"
import { ApiService } from "../services/api"
import {
  REMOTE_MIGRATION_FLAGS,
  isMigrated,
  markMigrated,
} from "./remote-migration"

export const PRIVACY_KEY = "focusquote.privacy"
const PRIVACY_REMOTE_MIGRATED_KEY = REMOTE_MIGRATION_FLAGS.privacy

export const Privacy = Schema.Struct({
  /** Master toggle for sending visited URLs to the server during sessions. */
  trackUrls: Schema.Boolean,
  /**
   * Hostnames (case-insensitive) that should never be tracked.
   * Matched as suffix: "example.com" blocks "www.example.com" too.
   */
  blocklist: Schema.Array(Schema.String),
})
export type Privacy = Schema.Schema.Type<typeof Privacy>

export const defaultPrivacy: Privacy = {
  trackUrls: false,
  blocklist: [
    "bankofamerica.com",
    "chase.com",
    "paypal.com",
    "wellsfargo.com",
    "santander.com",
    "mercadopago.com",
    "myhealthrecord.com",
    "patientportal.com",
  ],
}

export const loadPrivacy = (storage: StorageService): Effect.Effect<Privacy> =>
  Effect.gen(function* () {
    const raw = yield* storage
      .get<unknown>(PRIVACY_KEY)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))
    if (raw === null) return defaultPrivacy
    return yield* Schema.decodeUnknown(Privacy)(raw).pipe(
      Effect.catchAll(() => Effect.succeed(defaultPrivacy)),
    )
  })

export const savePrivacy = (
  storage: StorageService,
  next: Privacy,
): Effect.Effect<void, never> =>
  storage
    .set(PRIVACY_KEY, next)
    .pipe(Effect.catchAll(() => Effect.void))

export const isBlocked = (privacy: Privacy, hostname: string): boolean => {
  const h = hostname.toLowerCase()
  return privacy.blocklist.some((rule) => {
    const r = rule.toLowerCase().trim()
    if (!r) return false
    return h === r || h.endsWith(`.${r}`)
  })
}

/** Pull privacy state from server and cache locally. */
export const pullPrivacyFromRemote = (
  storage: StorageService,
): Effect.Effect<Privacy, never, ApiService> =>
  Effect.gen(function* () {
    const api = yield* ApiService
    const fallback = yield* loadPrivacy(storage)
    const res = yield* Effect.either(api.getPrivacy())
    if (res._tag === "Left") return fallback
    const next: Privacy = {
      trackUrls: res.right.privacy.trackUrls,
      blocklist: [...res.right.privacy.blocklist],
    }
    yield* savePrivacy(storage, next)
    return next
  })

export const pushPrivacyToRemote = (
  next: Privacy,
): Effect.Effect<void, never, ApiService> =>
  Effect.gen(function* () {
    const api = yield* ApiService
    yield* api
      .putPrivacy({ trackUrls: next.trackUrls, blocklist: [...next.blocklist] })
      .pipe(
        Effect.asVoid,
        Effect.catchAll(() => Effect.void),
      )
  })

export const ensurePrivacyMigrated = (
  storage: StorageService,
): Effect.Effect<void, never, ApiService> =>
  Effect.gen(function* () {
    if (yield* isMigrated(storage, PRIVACY_REMOTE_MIGRATED_KEY)) return
    const api = yield* ApiService
    const current = yield* loadPrivacy(storage)
    const res = yield* Effect.either(
      api.putPrivacy({
        trackUrls: current.trackUrls,
        blocklist: [...current.blocklist],
      }),
    )
    if (res._tag === "Right") {
      yield* markMigrated(storage, PRIVACY_REMOTE_MIGRATED_KEY)
    }
  })
