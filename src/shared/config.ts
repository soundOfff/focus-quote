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

export const isTursoConfigured = () =>
  buildConfig.tursoDbUrl.length > 0 && buildConfig.tursoAuthToken.length > 0
