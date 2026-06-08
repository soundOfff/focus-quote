import { describe, it, expect } from "vitest"
import {
  dropExcludedRecommendations,
  normalizeUrl,
  type ResourceRecommendation,
} from "../src/lib/llm"

// Layer A of the Vault-aware resource recommendations (ADR-0004 / issue #38):
// hard, deterministic exclusion done in CODE — never trusted to the model.

describe("normalizeUrl", () => {
  it("treats trailing-slash, fragment and host-case variants as the same page", () => {
    const a = normalizeUrl("https://Example.com/docs/")
    expect(normalizeUrl("https://example.com/docs")).toBe(a)
    expect(normalizeUrl("https://example.com/docs#section")).toBe(a)
    expect(normalizeUrl("https://EXAMPLE.com/docs/#x")).toBe(a)
  })

  it("keeps distinct paths and query strings distinct", () => {
    expect(normalizeUrl("https://example.com/a")).not.toBe(
      normalizeUrl("https://example.com/b"),
    )
    expect(normalizeUrl("https://example.com/s?q=1")).not.toBe(
      normalizeUrl("https://example.com/s?q=2"),
    )
  })

  it("does not collapse different hosts", () => {
    expect(normalizeUrl("https://a.example.com/x")).not.toBe(
      normalizeUrl("https://b.example.com/x"),
    )
  })
})

describe("dropExcludedRecommendations", () => {
  const rec = (url: string): ResourceRecommendation => ({
    url,
    title: url,
    why: "because",
  })

  it("drops a recommendation already in the known set, despite URL variants", () => {
    const out = dropExcludedRecommendations(
      [
        rec("https://known.com/page/"), // same page as an excluded URL
        rec("https://novel.com/article"),
      ],
      ["https://known.com/page#intro"],
    )
    expect(out.map((r) => r.url)).toEqual(["https://novel.com/article"])
  })

  it("excludes both Topic-Vault URLs and visited URLs", () => {
    const out = dropExcludedRecommendations(
      [rec("https://vault.com/a"), rec("https://visited.com/b"), rec("https://fresh.com/c")],
      ["https://vault.com/a", "https://visited.com/b"],
    )
    expect(out.map((r) => r.url)).toEqual(["https://fresh.com/c"])
  })

  it("returns everything when nothing is excluded", () => {
    const recs = [rec("https://a.com/1"), rec("https://b.com/2")]
    expect(dropExcludedRecommendations(recs, [])).toHaveLength(2)
  })
})
