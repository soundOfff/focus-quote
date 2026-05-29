import { describe, it, expect } from "vitest"
import { app } from "../src/app"
import { authedFetch, createTestUser, json } from "./helpers"

const iso = "2026-05-28T00:00:00.000Z"

type Graph = {
  tags: Array<{ id: string; name: string; userEdited: boolean }>
  edges: Array<{ parentId: string; childId: string }>
  memberships: Array<{ quoteId: string; tagId: string; userEdited: boolean }>
}

const upsertQuote = (id: string, text: string) => ({
  kind: "upsertQuote" as const,
  id,
  text,
  sourceUrl: null,
  sourceTitle: null,
  contentHash: id.padEnd(64, "0").slice(0, 64),
  createdAt: iso,
  updatedAt: iso,
})

describe("/api/tags", () => {
  it("requires auth for the graph endpoint", async () => {
    const res = await app.request("/api/tags/graph")
    expect(res.status).toBe(401)
  })

  it("manual tagging via sync pins the Tag and membership and files the quote", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)

    const batch = await fetch("/api/sync/batch", {
      ...json({
        jobs: [
          upsertQuote("q1", "a quote about react"),
          { kind: "upsertTag", id: "t1", name: "React", createdAt: iso, updatedAt: iso },
          { kind: "attachQuoteTag", quoteId: "q1", tagId: "t1", createdAt: iso },
        ],
      }),
    })
    expect(batch.status).toBe(200)
    const results = ((await batch.json()) as { results: Array<{ ok: boolean }> }).results
    expect(results.every((r) => r.ok)).toBe(true)

    const graph = (await (await fetch("/api/tags/graph")).json()) as Graph
    expect(graph.tags).toHaveLength(1)
    expect(graph.tags[0]!.name).toBe("React")
    expect(graph.tags[0]!.userEdited).toBe(true) // manual = pinned
    expect(graph.memberships).toHaveLength(1)
    expect(graph.memberships[0]!.userEdited).toBe(true)

    // Manually filed → no longer pending.
    const quotes = (await (await fetch("/api/quotes")).json()) as {
      quotes: Array<{ id: string; categorizationStatus: string }>
    }
    expect(quotes.quotes[0]!.categorizationStatus).toBe("categorized")
  })

  it("detach removes a membership; deleteTag cascades it away", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    await fetch("/api/sync/batch", {
      ...json({
        jobs: [
          upsertQuote("q1", "quote one"),
          { kind: "upsertTag", id: "t1", name: "Ideas", createdAt: iso, updatedAt: iso },
          { kind: "attachQuoteTag", quoteId: "q1", tagId: "t1", createdAt: iso },
        ],
      }),
    })

    await fetch("/api/sync/batch", {
      ...json({ jobs: [{ kind: "detachQuoteTag", quoteId: "q1", tagId: "t1" }] }),
    })
    let graph = (await (await fetch("/api/tags/graph")).json()) as Graph
    expect(graph.memberships).toHaveLength(0)
    expect(graph.tags).toHaveLength(1) // tag remains

    await fetch("/api/sync/batch", {
      ...json({ jobs: [{ kind: "deleteTag", id: "t1" }] }),
    })
    graph = (await (await fetch("/api/tags/graph")).json()) as Graph
    expect(graph.tags).toHaveLength(0)
  })

  it("cannot overwrite another user's Tag via a colliding client-generated id", async () => {
    const { token: tokenA } = await createTestUser()
    const { token: tokenB } = await createTestUser()
    const fetchA = authedFetch(tokenA)
    const fetchB = authedFetch(tokenB)

    await fetchA("/api/sync/batch", {
      ...json({ jobs: [{ kind: "upsertTag", id: "shared", name: "Alpha", createdAt: iso, updatedAt: iso }] }),
    })

    // B sends an upsertTag carrying A's (non-secret) tag id. It must NOT hijack.
    const res = await fetchB("/api/sync/batch", {
      ...json({ jobs: [{ kind: "upsertTag", id: "shared", name: "Beta", createdAt: iso, updatedAt: iso }] }),
    })
    expect(res.status).toBe(200)

    // A's tag is untouched...
    const graphA = (await (await fetchA("/api/tags/graph")).json()) as Graph
    expect(graphA.tags).toHaveLength(1)
    expect(graphA.tags[0]!.name).toBe("Alpha")

    // ...and B did not acquire a copy of it.
    const graphB = (await (await fetchB("/api/tags/graph")).json()) as Graph
    expect(graphB.tags).toHaveLength(0)
  })

  it("attachQuoteTag rejects a tag the user does not own", async () => {
    const { token: tokenA } = await createTestUser()
    const { token: tokenB } = await createTestUser()
    const fetchA = authedFetch(tokenA)
    const fetchB = authedFetch(tokenB)

    await fetchA("/api/sync/batch", {
      ...json({ jobs: [{ kind: "upsertTag", id: "ta", name: "A-only", createdAt: iso, updatedAt: iso }] }),
    })
    // B owns q-b but tries to attach A's tag id.
    const res = await fetchB("/api/sync/batch", {
      ...json({
        jobs: [
          upsertQuote("q-b", "b's quote"),
          { kind: "attachQuoteTag", quoteId: "q-b", tagId: "ta", createdAt: iso },
        ],
      }),
    })
    const results = ((await res.json()) as { results: Array<{ ok: boolean }> }).results
    expect(results[0]!.ok).toBe(true) // the quote upsert succeeds
    expect(results[1]!.ok).toBe(false) // the cross-user attach is rejected

    const graphB = (await (await fetchB("/api/tags/graph")).json()) as Graph
    expect(graphB.memberships).toHaveLength(0)
  })
})
