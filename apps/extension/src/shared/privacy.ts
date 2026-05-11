import { Effect, Schema } from "effect"
import type { StorageService } from "../services/storage"

export const PRIVACY_KEY = "focusquote.privacy"

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
