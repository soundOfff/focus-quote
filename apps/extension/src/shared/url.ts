const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export interface DomainValidationResult {
  ok: boolean
  value: string
  error?: string
}

export function normalizeDomainEntry(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
}

/**
 * Normalize a user-typed link for a `url` Vault item. Trims, assumes `https://`
 * when no scheme is given, and returns the canonical href — or `null` when the
 * input is empty, unparseable, or uses a non-http(s) scheme (e.g. `javascript:`,
 * `ftp://`). A dotted token before a colon (`example.com:8080`) is treated as a
 * bare host, not a scheme.
 */
export function normalizeVaultUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hasHttpScheme = /^https?:\/\//i.test(trimmed)
  const hasForeignScheme = !hasHttpScheme && /^[a-z][a-z0-9+-]*:/i.test(trimmed)
  if (hasForeignScheme) return null
  const candidate = hasHttpScheme ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(candidate)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.href
  } catch {
    return null
  }
}

export function validateDomainEntry(raw: string): DomainValidationResult {
  const value = normalizeDomainEntry(raw)
  if (!value) {
    return { ok: false, value, error: "Enter a domain like example.com." }
  }
  if (value.length > 253) {
    return { ok: false, value, error: "Domain is too long." }
  }
  if (/\s|\/|\?|#|@/.test(value)) {
    return {
      ok: false,
      value,
      error: "Use a bare domain (no slashes, queries, or spaces).",
    }
  }
  if (!value.includes(".")) {
    return { ok: false, value, error: "Include a TLD, like example.com." }
  }
  if (!DOMAIN_RE.test(value)) {
    return { ok: false, value, error: "That doesn't look like a valid domain." }
  }
  return { ok: true, value }
}
