import { describe, it, expect } from "vitest"
import {
  appendTurn,
  clearConversation,
  conversationKey,
  getConversation,
  openConversation,
  type ConversationMap,
} from "@/content/store/conversations"

describe("conversationKey", () => {
  it("strips the hash and a trailing slash so a page maps to one key", () => {
    expect(conversationKey("https://x.com/a#frag")).toBe("https://x.com/a")
    expect(conversationKey("https://x.com/a/")).toBe("https://x.com/a")
    expect(conversationKey("https://x.com/a#x")).toBe(
      conversationKey("https://x.com/a"),
    )
  })
})

describe("openConversation", () => {
  it("creates a new conversation with the given passage", () => {
    const map = openConversation({}, "https://x.com/a", "hello")
    expect(getConversation(map, "https://x.com/a")).toEqual({
      passage: "hello",
      history: [],
    })
  })

  it("keeps history and updates the passage when reopening with a new highlight", () => {
    let map: ConversationMap = openConversation({}, "https://x.com/a", "first")
    map = appendTurn(map, "https://x.com/a", { role: "user", content: "q1" })
    map = openConversation(map, "https://x.com/a", "second")
    const c = getConversation(map, "https://x.com/a")
    expect(c?.passage).toBe("second")
    expect(c?.history).toHaveLength(1)
  })

  it("keeps the existing passage when reopened with an empty highlight", () => {
    let map = openConversation({}, "https://x.com/a", "first")
    map = openConversation(map, "https://x.com/a", "")
    expect(getConversation(map, "https://x.com/a")?.passage).toBe("first")
  })
})

describe("appendTurn", () => {
  it("appends turns to the conversation for that URL only", () => {
    let map: ConversationMap = {}
    map = appendTurn(map, "https://x.com/a", { role: "user", content: "a1" })
    map = appendTurn(map, "https://x.com/b", { role: "user", content: "b1" })
    map = appendTurn(map, "https://x.com/a", { role: "assistant", content: "a2" })
    expect(getConversation(map, "https://x.com/a")?.history).toHaveLength(2)
    expect(getConversation(map, "https://x.com/b")?.history).toHaveLength(1)
  })

  it("preserves order and caps history at 40 turns", () => {
    let map: ConversationMap = {}
    for (let i = 0; i < 50; i++) {
      map = appendTurn(map, "https://x.com/a", { role: "user", content: `m${i}` })
    }
    const h = getConversation(map, "https://x.com/a")!.history
    expect(h).toHaveLength(40)
    expect(h[0]!.content).toBe("m10")
    expect(h[39]!.content).toBe("m49")
  })
})

describe("clearConversation", () => {
  it("removes only the targeted conversation", () => {
    let map = openConversation({}, "https://x.com/a", "a")
    map = openConversation(map, "https://x.com/b", "b")
    map = clearConversation(map, "https://x.com/a")
    expect(getConversation(map, "https://x.com/a")).toBeUndefined()
    expect(getConversation(map, "https://x.com/b")).toBeDefined()
  })
})
