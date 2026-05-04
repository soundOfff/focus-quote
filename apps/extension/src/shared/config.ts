/**
 * Build-time configuration baked in by Vite's `define`.
 * Values come from .env and are constant for the lifetime of the bundle.
 *
 * SECURITY: TURSO_AUTH_TOKEN ships in the extension bundle. Anyone who
 * unpacks the .crx can read/write the shared DB with this token.
 * Acceptable for personal/beta use; for distribution, front Turso with a
 * worker that enforces device_id ownership.
 */
export const buildConfig = {
  tursoDbUrl: __TURSO_DB_URL__,
  tursoAuthToken: __TURSO_AUTH_TOKEN__,
} as const

const VALID_PROTOCOLS = /^(libsql|https?|wss?|file):/i

export interface TursoConfigStatus {
  ok: boolean
  reason?: string
}

export const tursoConfigStatus = (): TursoConfigStatus => {
  const { tursoDbUrl, tursoAuthToken } = buildConfig
  if (!tursoDbUrl) return { ok: false, reason: "TURSO_DB_URL is empty" }
  if (!tursoAuthToken)
    return { ok: false, reason: "TURSO_AUTH_TOKEN is empty" }
  if (!VALID_PROTOCOLS.test(tursoDbUrl)) {
    // most common cause: URL and token were swapped in .env
    const looksLikeJwt = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(tursoDbUrl)
    const reason = looksLikeJwt
      ? "TURSO_DB_URL looks like a JWT — did you swap it with TURSO_AUTH_TOKEN in .env?"
      : `TURSO_DB_URL must start with libsql://, https://, http://, ws(s)://, or file:`
    return { ok: false, reason }
  }
  return { ok: true }
}

export const isTursoConfigured = () => tursoConfigStatus().ok
