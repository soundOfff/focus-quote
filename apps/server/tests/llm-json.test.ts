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

  // The cheap classifiers sometimes end their turn mid-object. Rather than
  // discard the whole reply (which left "Tidy now" silently doing nothing), we
  // balance the open brackets and recover the keys that did arrive.
  it("recovers a continuation truncated before its closing brace", () => {
    expect(parse('"attachTagIds":["t1"')).toEqual({ attachTagIds: ["t1"] })
  })

  // Regression for the consolidation crash: Haiku returned `"merges": [],
  // "renames": []` with "parents" and the closing brace dropped. The old code
  // mis-sliced an inner `[]` and threw; now the partial plan is recovered and
  // the missing key defaults to undefined (the caller treats it as empty).
  it("recovers a truncated tag-consolidation plan", () => {
    expect(parse('"merges": [],\n  "renames": []')).toEqual({
      merges: [],
      renames: [],
    })
  })

  // A merge truncated mid-list (with a dangling trailing comma) keeps the
  // complete entries and drops the incomplete tail.
  it("keeps complete entries when an array is truncated", () => {
    expect(parse('"merges": [{"fromId":"a","intoId":"b"},')).toEqual({
      merges: [{ fromId: "a", intoId: "b" }],
    })
  })
})
