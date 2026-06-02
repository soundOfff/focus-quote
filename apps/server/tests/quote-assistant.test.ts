import { describe, it, expect } from "vitest"
import { parseQuoteAssistantOutput } from "../src/lib/llm"

describe("parseQuoteAssistantOutput", () => {
  it("parses reply and well-formed sources from strict JSON", () => {
    const text = JSON.stringify({
      reply: "Memoization caches results of pure function calls.",
      sources: [
        {
          title: "Memoization — Wikipedia",
          url: "https://en.wikipedia.org/wiki/Memoization",
          snippet: "Canonical definition and examples.",
        },
      ],
    })
    const out = parseQuoteAssistantOutput(text)
    expect(out.reply).toContain("Memoization caches")
    expect(out.sources).toHaveLength(1)
    expect(out.sources[0]).toEqual({
      title: "Memoization — Wikipedia",
      url: "https://en.wikipedia.org/wiki/Memoization",
      snippet: "Canonical definition and examples.",
    })
  })

  it("strips ```json fences before parsing", () => {
    const text =
      '```json\n{"reply": "Hi there", "sources": []}\n```'
    const out = parseQuoteAssistantOutput(text)
    expect(out.reply).toBe("Hi there")
    expect(out.sources).toEqual([])
  })

  it("treats a missing sources field as an empty list", () => {
    const out = parseQuoteAssistantOutput(JSON.stringify({ reply: "no sources" }))
    expect(out.reply).toBe("no sources")
    expect(out.sources).toEqual([])
  })

  it("drops malformed and non-http source entries", () => {
    const text = JSON.stringify({
      reply: "answer",
      sources: [
        { title: "ok", url: "https://example.com", snippet: "good" },
        { title: "no scheme", url: "example.com/page", snippet: "bad" },
        { title: "ftp", url: "ftp://example.com", snippet: "bad" },
        { title: "missing url", snippet: "bad" },
        "not an object",
        null,
      ],
    })
    const out = parseQuoteAssistantOutput(text)
    expect(out.sources).toHaveLength(1)
    expect(out.sources[0]?.url).toBe("https://example.com")
  })

  it("falls back to url for a missing title and empty string for a missing snippet", () => {
    const text = JSON.stringify({
      reply: "answer",
      sources: [{ url: "https://example.com/docs" }],
    })
    const out = parseQuoteAssistantOutput(text)
    expect(out.sources[0]).toEqual({
      title: "https://example.com/docs",
      url: "https://example.com/docs",
      snippet: "",
    })
  })

  it("caps sources at 3", () => {
    const text = JSON.stringify({
      reply: "answer",
      sources: Array.from({ length: 6 }, (_, i) => ({
        title: `t${i}`,
        url: `https://example.com/${i}`,
        snippet: `s${i}`,
      })),
    })
    expect(parseQuoteAssistantOutput(text).sources).toHaveLength(3)
  })

  it("treats non-JSON output as a prose reply with no sources", () => {
    const out = parseQuoteAssistantOutput(
      "Just some prose the model returned without JSON.",
    )
    expect(out.reply).toBe("Just some prose the model returned without JSON.")
    expect(out.sources).toEqual([])
  })

  it("returns an empty reply for empty input", () => {
    expect(parseQuoteAssistantOutput("   ")).toEqual({ reply: "", sources: [] })
  })
})
