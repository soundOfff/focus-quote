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
