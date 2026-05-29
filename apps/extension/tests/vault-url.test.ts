import { describe, it, expect } from "vitest"
import { normalizeVaultUrl } from "@/shared/url"

describe("normalizeVaultUrl", () => {
  it("returns null for empty / whitespace-only input", () => {
    expect(normalizeVaultUrl("")).toBeNull()
    expect(normalizeVaultUrl("   ")).toBeNull()
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeVaultUrl("  https://example.com/a  ")).toBe(
      "https://example.com/a",
    )
  })

  it("prepends https:// when no scheme is present", () => {
    expect(normalizeVaultUrl("example.com")).toBe("https://example.com/")
    expect(normalizeVaultUrl("example.com/path?q=1")).toBe(
      "https://example.com/path?q=1",
    )
  })

  it("preserves an existing http or https scheme", () => {
    expect(normalizeVaultUrl("http://example.com/x")).toBe(
      "http://example.com/x",
    )
    expect(normalizeVaultUrl("https://example.com/x")).toBe(
      "https://example.com/x",
    )
  })

  it("rejects unparseable junk", () => {
    expect(normalizeVaultUrl("not a url")).toBeNull()
    expect(normalizeVaultUrl("http://")).toBeNull()
  })

  it("rejects non-http(s) schemes (e.g. javascript:)", () => {
    expect(normalizeVaultUrl("javascript:alert(1)")).toBeNull()
    expect(normalizeVaultUrl("ftp://example.com")).toBeNull()
  })
})
