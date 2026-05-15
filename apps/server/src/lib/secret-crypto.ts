import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * AES-256-GCM at-rest encryption for user-provided secrets (e.g. an
 * OpenRouter API key). The encryption key must be a 32-byte value provided
 * via `SECRETS_ENCRYPTION_KEY` (base64). The encoded value stored in the
 * database is `${iv_b64}:${tag_b64}:${ciphertext_b64}`.
 *
 * We read the env at call time (rather than from the validated `env` module)
 * so tests can swap keys per case without a full server restart.
 */

const ALGO = "aes-256-gcm"
const IV_BYTES = 12

const decodeKey = (raw: string | undefined): Buffer | null => {
  if (!raw) return null
  const buf = Buffer.from(raw, "base64")
  return buf.length === 32 ? buf : null
}

const loadKey = (): Buffer => {
  const buf = decodeKey(process.env.SECRETS_ENCRYPTION_KEY)
  if (!buf) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY not configured (need 32 raw bytes, base64).",
    )
  }
  return buf
}

export const isSecretsKeyConfigured = (): boolean =>
  decodeKey(process.env.SECRETS_ENCRYPTION_KEY) !== null

export function encryptSecret(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString(
    "base64",
  )}`
}

export function decryptSecret(encoded: string): string {
  const key = loadKey()
  const [ivB64, tagB64, dataB64] = encoded.split(":")
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret payload")
  }
  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const data = Buffer.from(dataB64, "base64")
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(data), decipher.final()])
  return dec.toString("utf8")
}

/**
 * Returns a masked hint useful for the UI when the real value must stay on
 * the server: `sk-or-abcd…wxyz`. Falls back to a fixed mask on short values.
 */
export function maskSecretHint(plaintext: string): string {
  const trimmed = plaintext.trim()
  if (trimmed.length < 8) return "••••"
  const head = trimmed.slice(0, 4)
  const tail = trimmed.slice(-4)
  return `${head}…${tail}`
}
