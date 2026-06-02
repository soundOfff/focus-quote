import { describe, it, expect, vi } from "vitest"

// Mock the LLM so the Tidy filing sweep is deterministic in the test env (where
// no API key is configured). classifyQuoteIntoTags files the untagged quote
// under a new Tag; proposeTagConsolidation is a no-op so the restructuring step
// does nothing. Isolated in its own file so the mock never leaks into the
// manual-path assertions in tags.test.ts.
vi.mock("../src/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/llm")>()
  return {
    ...actual,
    classifyQuoteIntoTags: vi.fn(async () => ({
      attachTagIds: [],
      newTag: "LLMs",
    })),
    proposeTagConsolidation: vi.fn(async () => null),
  }
})

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

const baseSettings = {
  theme: "dark" as const,
  defaultDurationMinutes: 25,
  defaultBreakMinutes: 5,
  translateFromLang: "auto",
  translateToLang: "en",
}

describe("/api/tags/consolidate — filing step", () => {
  it("Tidy files a quote sitting in the Untagged bucket", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)

    // Save the quote with per-Save tagging turned off so it lands Untagged —
    // the real-world case the user hit (captured before tagging existed, or
    // while the rate-limit bucket was dry).
    await fetch("/api/settings", {
      ...json({ ...baseSettings, aiFeatureOverrides: { quoteTagging: false } }),
      method: "PUT",
    })
    await fetch("/api/sync/batch", {
      ...json({
        jobs: [upsertQuote("q1", "GPT-4 and other large language models")],
      }),
    })

    let graph = (await (await fetch("/api/tags/graph")).json()) as Graph
    expect(graph.memberships).toHaveLength(0) // untagged at rest

    // Turn tagging back on and run "Tidy now".
    await fetch("/api/settings", {
      ...json({ ...baseSettings, aiFeatureOverrides: { quoteTagging: true } }),
      method: "PUT",
    })
    const res = await fetch("/api/tags/consolidate", { method: "POST" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { changes: { filed: number } }
    expect(body.changes.filed).toBe(1)

    graph = (await (await fetch("/api/tags/graph")).json()) as Graph
    expect(graph.tags).toHaveLength(1)
    expect(graph.tags[0]!.name).toBe("LLMs")
    expect(graph.tags[0]!.userEdited).toBe(false) // AI-filed, not pinned
    expect(graph.memberships).toHaveLength(1)
    expect(graph.memberships[0]!.quoteId).toBe("q1")
  })

  it("does not file when quoteTagging is gated off", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)

    await fetch("/api/settings", {
      ...json({ ...baseSettings, aiFeatureOverrides: { quoteTagging: false } }),
      method: "PUT",
    })
    await fetch("/api/sync/batch", {
      ...json({ jobs: [upsertQuote("q1", "a loose quote")] }),
    })

    const res = await fetch("/api/tags/consolidate", { method: "POST" })
    const body = (await res.json()) as { changes: { filed: number } }
    expect(body.changes.filed).toBe(0)

    const graph = (await (await fetch("/api/tags/graph")).json()) as Graph
    expect(graph.memberships).toHaveLength(0)
  })
})
