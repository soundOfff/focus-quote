import { describe, it, expect } from "vitest"
import { reconstructJson, stripFences } from "../src/lib/llm"

// The cheaper Haiku models routinely wrap their JSON in prose despite the "no
// prose" instruction; stripFences must recover the JSON object regardless so
// the per-Save categorizer and "Tidy now" filing sweep don't silently fail
// (the bug that left LLM quotes stuck in Untagged).
describe("stripFences", () => {
  const parse = (s: string) => JSON.parse(stripFences(s)) as unknown

  it("passes through clean JSON", () => {
    expect(parse('{"attachTagIds":[],"newTag":"LLMs"}')).toEqual({
      attachTagIds: [],
      newTag: "LLMs",
    })
  })

  it("recovers JSON behind a prose preamble", () => {
    expect(
      parse('Here is the JSON:\n{"attachTagIds":["t1"],"newTag":null}'),
    ).toEqual({ attachTagIds: ["t1"], newTag: null })
  })

  it("strips markdown code fences", () => {
    expect(parse('```json\n{"newTag":"Rust"}\n```')).toEqual({ newTag: "Rust" })
  })

  it("drops trailing prose after the object", () => {
    expect(parse('{"newTag":"Rust"} — hope that helps!')).toEqual({
      newTag: "Rust",
    })
  })

  it("handles a prefilled '{' continuation (the assistant-prefill path)", () => {
    // generate() prepends the prefilled "{" before parsing.
    expect(parse('{' + '"attachTagIds":[],"newTag":"AI"}')).toEqual({
      attachTagIds: [],
      newTag: "AI",
    })
  })

  it("recovers a JSON array when no object is present", () => {
    expect(parse('Sure! ["a","b"]')).toEqual(["a", "b"])
  })
})

// We prefill the assistant turn with "{". reconstructJson must cope with every
// way a provider/model can answer that prefill: continue the object, ignore it
// and emit prose, or restate the whole object.
describe("reconstructJson", () => {
  const parse = (s: string) => JSON.parse(reconstructJson(s)) as unknown

  it("restores the leading brace on a continuation (prefill honoured)", () => {
    expect(parse('"attachTagIds":[],"newTag":"LLMs"}')).toEqual({
      attachTagIds: [],
      newTag: "LLMs",
    })
  })

  it("extracts prose-wrapped JSON when the prefill was ignored", () => {
    expect(parse('Here is the JSON: {"newTag":"Rust"}')).toEqual({
      newTag: "Rust",
    })
  })

  it("handles a model that restated the whole object", () => {
    expect(parse('{"newTag":"AI"}')).toEqual({ newTag: "AI" })
  })

  it("returns an unparseable best-effort string when truncated", () => {
    // No closing brace — nothing can recover it; the caller's try/catch nulls.
    expect(() => parse('"attachTagIds":["t1"')).toThrow()
  })
})
