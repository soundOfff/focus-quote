import { describe, it, expect, beforeEach, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { db } from "../src/db/client"
import {
  focusSessions,
  sessionUrls,
  topics,
  topicVaultItems,
} from "../src/db/schema"
import { createTestUser } from "./helpers"

// Capture the args the study-artifacts layer threads into the LLM generators so
// we can assert the Vault context (notes/screenshots for recall; exclude + seed
// for resources) reaches them — without spending tokens or hitting the network.
const h = vi.hoisted(() => ({
  recall: vi.fn(async () => [{ q: "Q", a: "A" }]),
  resources: vi.fn(async () => [
    { url: "https://novel.example.com/x", title: "X", why: "w" },
  ]),
  studyTips: vi.fn(async () => ["tip"]),
}))

vi.mock("../src/lib/llm", () => ({
  generateRecallQuestions: h.recall,
  generateResourceRecommendations: h.resources,
  generateStudyTips: h.studyTips,
}))

vi.mock("../src/lib/ai-gate", () => ({
  aiFeatureEnabledForUser: vi.fn(async () => true),
}))

import {
  maybeGenerateRecallQuestions,
  maybeGenerateResourceRecommendations,
} from "../src/lib/study-artifacts"

const seedTopic = async (userId: string) => {
  const id = randomUUID()
  await db.insert(topics).values({ id, userId, name: "Biology" })
  return id
}

const seedSession = async (userId: string, topicId: string | null) => {
  const id = randomUUID()
  await db.insert(focusSessions).values({
    id,
    userId,
    goal: "Understand cellular respiration",
    completed: true,
    topicId,
  })
  return id
}

const seedVaultItem = async (
  userId: string,
  topicId: string,
  sessionId: string | null,
  item: { kind: string; body: string; title?: string | null },
) => {
  await db.insert(topicVaultItems).values({
    id: randomUUID(),
    userId,
    topicId,
    sessionId,
    kind: item.kind,
    body: item.body,
    title: item.title ?? null,
  })
}

describe("Vault-aware completion artifacts (ADR-0004, #38/#39)", () => {
  beforeEach(() => {
    h.recall.mockClear()
    h.resources.mockClear()
    h.studyTips.mockClear()
  })

  it("#39: recall draws notes + screenshot captions from the Topic Vault, with zero tracked visits", async () => {
    const { userId } = await createTestUser()
    const topicId = await seedTopic(userId)
    const sessionId = await seedSession(userId, topicId)
    await seedVaultItem(userId, topicId, sessionId, {
      kind: "note",
      body: "ATP is the energy currency of the cell",
    })
    await seedVaultItem(userId, topicId, sessionId, {
      kind: "image",
      body: "https://img.example.com/krebs.png",
      title: "Diagram of the Krebs cycle",
    })
    // A saved URL is not recall material — it must not become a note.
    await seedVaultItem(userId, topicId, sessionId, {
      kind: "url",
      body: "https://known.example.com/atp",
    })

    await maybeGenerateRecallQuestions(userId, sessionId, { onDemand: true })

    expect(h.recall).toHaveBeenCalledTimes(1)
    const [input, opts] = h.recall.mock.calls[0] as unknown as [
      { urls: unknown[] },
      { vault: Array<{ kind: string; text: string }> },
    ]
    expect(input.urls).toHaveLength(0) // vault-first: no visits present
    expect(opts.vault).toEqual(
      expect.arrayContaining([
        { kind: "note", text: "ATP is the energy currency of the cell" },
        { kind: "screenshot", text: "Diagram of the Krebs cycle" },
      ]),
    )
    expect(opts.vault).toHaveLength(2) // the saved URL is excluded
  })

  it("#39: a captionless screenshot (title=null) still feeds recall via its source URL", async () => {
    const { userId } = await createTestUser()
    const topicId = await seedTopic(userId)
    const sessionId = await seedSession(userId, topicId)
    // Right-click "Save image" saves post title=null with the page URL in body.
    await seedVaultItem(userId, topicId, sessionId, {
      kind: "image",
      body: "https://en.wikipedia.org/wiki/Krebs_cycle",
      title: null,
    })

    await maybeGenerateRecallQuestions(userId, sessionId, { onDemand: true })

    expect(h.recall).toHaveBeenCalledTimes(1)
    const [, opts] = h.recall.mock.calls[0] as unknown as [
      unknown,
      { vault: Array<{ kind: string; text: string }> },
    ]
    expect(opts.vault).toEqual([
      { kind: "screenshot", text: "https://en.wikipedia.org/wiki/Krebs_cycle" },
    ])
  })

  it("#38: a screenshot's source URL is excluded from recommendations", async () => {
    const { userId } = await createTestUser()
    const topicId = await seedTopic(userId)
    const sessionId = await seedSession(userId, topicId)
    await seedVaultItem(userId, topicId, sessionId, {
      kind: "image",
      body: "https://blog.example.com/the-krebs-cycle",
      title: "Krebs cycle deep-dive",
    })

    await maybeGenerateResourceRecommendations(userId, sessionId)

    expect(h.resources).toHaveBeenCalledTimes(1)
    const [, opts] = h.resources.mock.calls[0] as unknown as [
      unknown,
      { excludeUrls: string[] },
    ]
    expect(opts.excludeUrls).toContain("https://blog.example.com/the-krebs-cycle")
  })

  it("#38: resources exclude the whole Topic Vault but seed only this session's saves", async () => {
    const { userId } = await createTestUser()
    const topicId = await seedTopic(userId)
    const sessionId = await seedSession(userId, topicId)
    const otherSessionId = await seedSession(userId, topicId)

    // This session's saves (session scope) — used for BOTH exclude and seed.
    await seedVaultItem(userId, topicId, sessionId, {
      kind: "url",
      body: "https://known.example.com/a",
    })
    await seedVaultItem(userId, topicId, sessionId, {
      kind: "note",
      body: "Glycolysis happens in the cytoplasm",
    })
    // Another session's save under the same Topic — excluded (topic scope) but
    // NOT seeded (different session).
    await seedVaultItem(userId, topicId, otherSessionId, {
      kind: "url",
      body: "https://known.example.com/b",
    })
    // A tracked visit this session — also excluded.
    await db.insert(sessionUrls).values({
      id: randomUUID(),
      userId,
      sessionId,
      url: "https://visited.example.com/c",
      hostname: "visited.example.com",
      title: "Visited",
    })

    await maybeGenerateResourceRecommendations(userId, sessionId)

    expect(h.resources).toHaveBeenCalledTimes(1)
    const [, opts] = h.resources.mock.calls[0] as unknown as [
      unknown,
      {
        excludeUrls: string[]
        vault: Array<{ kind: string; body: string }>
      },
    ]
    // Layer A exclude = Topic Vault URLs (both sessions). Visited URLs are added
    // inside the generator from `input.urls`, so they need not appear here.
    expect(opts.excludeUrls).toEqual(
      expect.arrayContaining([
        "https://known.example.com/a",
        "https://known.example.com/b",
      ]),
    )
    // Layer B seed = this session's saves only (session scope).
    const seedBodies = opts.vault.map((v) => v.body)
    expect(seedBodies).toEqual(
      expect.arrayContaining([
        "https://known.example.com/a",
        "Glycolysis happens in the cytoplasm",
      ]),
    )
    expect(seedBodies).not.toContain("https://known.example.com/b")
  })

  it("does not generate when there are neither visits nor any Vault material", async () => {
    const { userId } = await createTestUser()
    const sessionId = await seedSession(userId, null) // no topic, no vault

    await maybeGenerateRecallQuestions(userId, sessionId, { onDemand: true })
    await maybeGenerateResourceRecommendations(userId, sessionId)

    expect(h.recall).not.toHaveBeenCalled()
    expect(h.resources).not.toHaveBeenCalled()
  })
})
