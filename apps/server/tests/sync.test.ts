import { describe, it, expect } from "vitest"
import { app } from "../src/app"
import { authedFetch, createTestUser, json } from "./helpers"

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

  it("upsertQuote is idempotent (last-write-wins on updatedAt)", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const t1 = "2026-05-04T10:00:00.000Z"
    const t2 = "2026-05-04T11:00:00.000Z"

    await fetch("/api/sync/batch", {
      ...json({
        jobs: [
          { kind: "upsertQuote", id: "qx", text: "v1", sourceUrl: null, sourceTitle: null, tag: null, createdAt: t1, updatedAt: t1 },
        ],
      }),
    })
    await fetch("/api/sync/batch", {
      ...json({
        jobs: [
          { kind: "upsertQuote", id: "qx", text: "v2", sourceUrl: null, sourceTitle: null, tag: null, createdAt: t1, updatedAt: t2 },
        ],
      }),
    })

    const list = await fetch("/api/quotes")
    const body = (await list.json()) as { quotes: Array<{ id: string; text: string }> }
    expect(body.quotes).toHaveLength(1)
    expect(body.quotes[0]!.text).toBe("v2")
  })
})
