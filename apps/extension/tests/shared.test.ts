import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import { Quote, NewQuote, Session } from "@focus-quote/shared"

describe("schemas", () => {
  it("accepts a valid Quote", () => {
    const decoded = Schema.decodeUnknownSync(Quote)({
      id: "abc",
      text: "hello",
      sourceUrl: null,
      sourceTitle: null,
      tag: null,
      createdAt: "2026-05-04",
      updatedAt: "2026-05-04",
    })
    expect(decoded.text).toBe("hello")
  })

  it("rejects empty quote text", () => {
    expect(() =>
      Schema.decodeUnknownSync(NewQuote)({
        text: "",
        sourceUrl: null,
        sourceTitle: null,
        tag: null,
      }),
    ).toThrow()
  })

  it("accepts a valid Session", () => {
    const decoded = Schema.decodeUnknownSync(Session)({
      id: "s1",
      goal: null,
      durationMinutes: 25,
      breakMinutes: 5,
      completed: false,
      startedAt: "2026-05-04",
      endedAt: null,
    })
    expect(decoded.completed).toBe(false)
  })
})
