import { describe, it, expect } from "vitest"
import {
  conversationThreadId,
  buildConversationSyncJobs,
} from "@/services/conversation-sync"

describe("conversationThreadId", () => {
  it("is deterministic for the same article URL", async () => {
    const a = await conversationThreadId("https://example.com/post")
    const b = await conversationThreadId("https://example.com/post")
    expect(a).toBe(b)
    expect(a.startsWith("conv_")).toBe(true)
  })

  it("normalizes hash + trailing slash to the same thread id", async () => {
    const plain = await conversationThreadId("https://example.com/post")
    const slash = await conversationThreadId("https://example.com/post/")
    const hash = await conversationThreadId("https://example.com/post#section")
    expect(slash).toBe(plain)
    expect(hash).toBe(plain)
  })

  it("yields different ids for different articles", async () => {
    const a = await conversationThreadId("https://example.com/a")
    const b = await conversationThreadId("https://example.com/b")
    expect(a).not.toBe(b)
  })
})

describe("buildConversationSyncJobs", () => {
  const base = {
    threadId: "conv_abc",
    sourceUrl: "https://example.com/post",
    passage: "the highlighted passage",
    now: "2026-05-28T00:00:00.000Z",
  }

  it("emits a thread upsert first, then one message per turn", () => {
    const jobs = buildConversationSyncJobs({
      ...base,
      turns: [
        { id: "m1", role: "user", content: "hi", createdAt: "2026-05-28T00:00:01.000Z" },
        { id: "m2", role: "assistant", content: "hello", createdAt: "2026-05-28T00:00:02.000Z" },
      ],
    })

    expect(jobs).toHaveLength(3)
    expect(jobs[0]).toEqual({
      kind: "upsertChatThread",
      id: "conv_abc",
      sourceUrl: "https://example.com/post",
      passage: "the highlighted passage",
      createdAt: base.now,
      updatedAt: base.now,
    })
    expect(jobs[1]).toEqual({
      kind: "appendChatMessage",
      id: "m1",
      threadId: "conv_abc",
      role: "user",
      content: "hi",
      createdAt: "2026-05-28T00:00:01.000Z",
    })
    expect(jobs[2]).toMatchObject({ kind: "appendChatMessage", id: "m2", role: "assistant" })
  })

  it("represents an empty passage as null", () => {
    const jobs = buildConversationSyncJobs({ ...base, passage: "", turns: [] })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ kind: "upsertChatThread", passage: null })
  })
})
