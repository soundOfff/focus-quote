import { describe, it, expect } from "vitest"
import { app } from "../src/app"
import { ensureTopicId } from "../src/lib/topic"
import { authedFetch, createTestUser, json } from "./helpers"

type SessionRow = { id: string; topic: string | null; topicId: string | null }

describe("/api/sync/batch", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.request("/api/sync/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs: [{ kind: "deleteQuote", id: "x" }] }),
    })
    expect(res.status).toBe(401)
  })

  it("applies upsertQuote, deleteQuote, and upsertSession in one batch", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)

    const now = new Date().toISOString()
    const res = await fetch("/api/sync/batch", {
      ...json({
        jobs: [
          {
            kind: "upsertQuote",
            id: "q1",
            text: "first",
            sourceUrl: null,
            sourceTitle: null,
            tag: null,
            contentHash: "a".repeat(64),
            createdAt: now,
            updatedAt: now,
          },
          {
            kind: "upsertSession",
            id: "s1",
            goal: "ship MVP",
            durationMinutes: 25,
            breakMinutes: 5,
            completed: true,
            startedAt: now,
            endedAt: now,
          },
          { kind: "deleteQuote", id: "q1" },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { results: Array<{ ok: boolean }> }
    expect(body.results).toHaveLength(3)
    expect(body.results.every((r) => r.ok)).toBe(true)

    const quotes = await fetch("/api/quotes")
    expect(((await quotes.json()) as { quotes: unknown[] }).quotes).toHaveLength(0)

    const sessions = await fetch("/api/focus-sessions")
    expect(((await sessions.json()) as { sessions: unknown[] }).sessions).toHaveLength(1)
  })

  it("drains a Conversation into ai_chat_threads/messages, idempotently", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const t0 = "2026-05-28T00:00:00.000Z"
    const t1 = "2026-05-28T00:00:01.000Z"
    const t2 = "2026-05-28T00:00:02.000Z"
    const threadId = "conv_test_thread"

    const batch = {
      ...json({
        jobs: [
          {
            kind: "upsertChatThread",
            id: threadId,
            sourceUrl: "https://example.com/post",
            passage: "the highlighted passage",
            createdAt: t0,
            updatedAt: t0,
          },
          {
            kind: "appendChatMessage",
            id: "m1",
            threadId,
            role: "user",
            content: "what does this mean?",
            createdAt: t1,
          },
          {
            kind: "appendChatMessage",
            id: "m2",
            threadId,
            role: "assistant",
            content: "it means...",
            createdAt: t2,
          },
        ],
      }),
    }

    const res = await fetch("/api/sync/batch", batch)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { results: Array<{ ok: boolean }> }
    expect(body.results.every((r) => r.ok)).toBe(true)

    // Re-draining the same queue (offline retry) must not duplicate anything.
    await fetch("/api/sync/batch", batch)

    const threads = await fetch("/api/ai-history/threads?kind=quote_assistant")
    const threadBody = (await threads.json()) as {
      threads: Array<{ id: string; sourceUrl: string | null; passage: string | null }>
    }
    expect(threadBody.threads).toHaveLength(1)
    expect(threadBody.threads[0]!.id).toBe(threadId)
    expect(threadBody.threads[0]!.sourceUrl).toBe("https://example.com/post")
    expect(threadBody.threads[0]!.passage).toBe("the highlighted passage")

    const messages = await fetch(
      `/api/ai-history/threads/${threadId}/messages`,
    )
    const msgBody = (await messages.json()) as {
      messages: Array<{ id: string; role: string; content: string }>
    }
    expect(msgBody.messages).toHaveLength(2)
    expect(msgBody.messages.map((m) => m.role)).toEqual(["user", "assistant"])
  })

  it("does not leak Conversations across users", async () => {
    const { token: tokenA } = await createTestUser()
    const { token: tokenB } = await createTestUser()
    const fetchA = authedFetch(tokenA)
    const fetchB = authedFetch(tokenB)
    const now = "2026-05-28T00:00:00.000Z"

    await fetchA("/api/sync/batch", {
      ...json({
        jobs: [
          {
            kind: "upsertChatThread",
            id: "conv_shared_id",
            sourceUrl: "https://example.com/x",
            passage: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    })

    // B cannot append to A's thread; the FK/ownership check rejects that item.
    const res = await fetchB("/api/sync/batch", {
      ...json({
        jobs: [
          {
            kind: "appendChatMessage",
            id: "mb",
            threadId: "conv_shared_id",
            role: "user",
            content: "sneaky",
            createdAt: now,
          },
        ],
      }),
    })
    const body = (await res.json()) as { results: Array<{ ok: boolean }> }
    expect(body.results[0]!.ok).toBe(false)

    const threadsB = await fetchB("/api/ai-history/threads?kind=quote_assistant")
    expect(
      ((await threadsB.json()) as { threads: unknown[] }).threads,
    ).toHaveLength(0)
  })

  it("files an upsertSession under the chosen topicId", async () => {
    const { userId, token } = await createTestUser()
    const fetch = authedFetch(token)
    const topicId = await ensureTopicId(userId, "Linear Algebra")
    const now = new Date().toISOString()

    const res = await fetch("/api/sync/batch", {
      ...json({
        jobs: [
          {
            kind: "upsertSession",
            id: "s-topic",
            goal: "study eigenvectors",
            topicId,
            durationMinutes: 25,
            breakMinutes: 5,
            completed: false,
            startedAt: now,
            endedAt: null,
          },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { results: Array<{ ok: boolean }> }
    expect(body.results[0]!.ok).toBe(true)

    const sessions = await fetch("/api/focus-sessions")
    const row = (
      (await sessions.json()) as { sessions: SessionRow[] }
    ).sessions.find((s) => s.id === "s-topic")
    expect(row!.topic).toBe("Linear Algebra")
    expect(row!.topicId).toBe(topicId)
  })

  it("ignores a foreign-owned topicId — the session still files, unfiled", async () => {
    const { userId: userA } = await createTestUser()
    const { token: tokenB } = await createTestUser()
    const foreignTopicId = await ensureTopicId(userA, "A's private topic")
    const fetchB = authedFetch(tokenB)
    const now = new Date().toISOString()

    const res = await fetchB("/api/sync/batch", {
      ...json({
        jobs: [
          {
            kind: "upsertSession",
            id: "s-foreign",
            goal: "sneaky",
            topicId: foreignTopicId,
            durationMinutes: 25,
            breakMinutes: 5,
            completed: false,
            startedAt: now,
            endedAt: null,
          },
        ],
      }),
    })
    const body = (await res.json()) as { results: Array<{ ok: boolean }> }
    expect(body.results[0]!.ok).toBe(true)

    const sessions = await fetchB("/api/focus-sessions")
    const row = (
      (await sessions.json()) as { sessions: SessionRow[] }
    ).sessions.find((s) => s.id === "s-foreign")
    expect(row!.topic).toBeNull()
    expect(row!.topicId).toBeNull()
  })

  it("upsertQuote is idempotent (last-write-wins on updatedAt)", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const t1 = "2026-05-04T10:00:00.000Z"
    const t2 = "2026-05-04T11:00:00.000Z"

    await fetch("/api/sync/batch", {
      ...json({
        jobs: [
          { kind: "upsertQuote", id: "qx", text: "v1", sourceUrl: null, sourceTitle: null, tag: null, contentHash: "b".repeat(64), createdAt: t1, updatedAt: t1 },
        ],
      }),
    })
    await fetch("/api/sync/batch", {
      ...json({
        jobs: [
          { kind: "upsertQuote", id: "qx", text: "v2", sourceUrl: null, sourceTitle: null, tag: null, contentHash: "c".repeat(64), createdAt: t1, updatedAt: t2 },
        ],
      }),
    })

    const list = await fetch("/api/quotes")
    const body = (await list.json()) as { quotes: Array<{ id: string; text: string }> }
    expect(body.quotes).toHaveLength(1)
    expect(body.quotes[0]!.text).toBe("v2")
  })
})
