import { describe, it, expect, vi } from "vitest"
import { randomUUID } from "node:crypto"

// Mock the embeddings helper so the classification pipeline produces a
// deterministic, non-null distraction score in the test env (where no LLM key
// is configured). This lets us distinguish "classified" (score written) from
// "skipped because gated off" (score stays null).
vi.mock("../src/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/llm")>()
  return {
    ...actual,
    embed: vi.fn(async () => [1, 0, 0]),
  }
})

import { eq } from "drizzle-orm"
import { db } from "../src/db/client"
import { focusSessions, sessionUrls } from "../src/db/schema"
import { classifyBatch } from "../src/routes/session-urls"
import { authedFetch, createTestUser, json } from "./helpers"

const baseSettings = {
  theme: "dark" as const,
  defaultDurationMinutes: 25,
  defaultBreakMinutes: 5,
  translateFromLang: "auto",
  translateToLang: "en",
}

describe("server-side AI gate — toolbar routes", () => {
  it("blocks /api/ai/quote-assistant with 403 AI_DISABLED when the master switch is off", async () => {
    const { token } = await createTestUser()
    await authedFetch(token)("/api/settings", {
      ...json({ ...baseSettings, aiMasterEnabled: false }),
      method: "PUT",
    })

    const res = await authedFetch(token)("/api/ai/quote-assistant", {
      ...json({ passage: "Some highlighted passage." }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { code?: string }
    expect(body.code).toBe("AI_DISABLED")
  })

  it("blocks /api/ai/guide-steps with 403 AI_DISABLED when guideMe is overridden off", async () => {
    const { token } = await createTestUser()
    await authedFetch(token)("/api/settings", {
      ...json({ ...baseSettings, aiFeatureOverrides: { guideMe: false } }),
      method: "PUT",
    })

    const res = await authedFetch(token)("/api/ai/guide-steps", {
      ...json({ goal: "Finish the report" }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { code?: string }
    expect(body.code).toBe("AI_DISABLED")
  })

  it("passes the gate when the feature is enabled (no LLM key → 503, not 403)", async () => {
    const { token } = await createTestUser()
    // Default settings: master on, quoteAssistant on (onDemand tier). The gate
    // should let the request through to the LLM call, which is unavailable in
    // the test env and yields 503 — proving we got past the gate, not blocked.
    const res = await authedFetch(token)("/api/ai/quote-assistant", {
      ...json({ passage: "Some highlighted passage." }),
    })
    expect(res.status).toBe(503)
  })
})

describe("server-side AI gate — URL distraction classification", () => {
  const seedSessionWithUrl = async (userId: string) => {
    const sessionId = randomUUID()
    const urlId = randomUUID()
    await db.insert(focusSessions).values({
      id: sessionId,
      userId,
      goal: "Study linear algebra",
    })
    await db.insert(sessionUrls).values({
      id: urlId,
      userId,
      sessionId,
      url: "https://twitter.com/home",
      hostname: "twitter.com",
      title: "Twitter",
      visitedAt: new Date().toISOString(),
    })
    return { sessionId, urlId }
  }

  it("scores a visit when distractionDetection is enabled (default)", async () => {
    const { userId } = await createTestUser()
    const { urlId } = await seedSessionWithUrl(userId)

    await classifyBatch(userId, [
      {
        id: urlId,
        sessionId: (await db
          .select({ s: sessionUrls.sessionId })
          .from(sessionUrls)
          .where(eq(sessionUrls.id, urlId))
          .limit(1))[0]!.s,
        url: "https://twitter.com/home",
        hostname: "twitter.com",
        title: "Twitter",
      },
    ])

    const [row] = await db
      .select({ score: sessionUrls.distractionScore })
      .from(sessionUrls)
      .where(eq(sessionUrls.id, urlId))
      .limit(1)
    expect(row!.score).not.toBeNull()
  })

  it("skips classification entirely when distractionDetection is gated off", async () => {
    const { userId, token } = await createTestUser()
    await authedFetch(token)("/api/settings", {
      ...json({
        ...baseSettings,
        aiFeatureOverrides: { distractionDetection: false },
      }),
      method: "PUT",
    })
    const { sessionId, urlId } = await seedSessionWithUrl(userId)

    await classifyBatch(userId, [
      {
        id: urlId,
        sessionId,
        url: "https://twitter.com/home",
        hostname: "twitter.com",
        title: "Twitter",
      },
    ])

    const [row] = await db
      .select({ score: sessionUrls.distractionScore })
      .from(sessionUrls)
      .where(eq(sessionUrls.id, urlId))
      .limit(1)
    expect(row!.score).toBeNull()
  })

  it("is also blocked by the master switch", async () => {
    const { userId, token } = await createTestUser()
    await authedFetch(token)("/api/settings", {
      ...json({ ...baseSettings, aiMasterEnabled: false }),
      method: "PUT",
    })
    const { sessionId, urlId } = await seedSessionWithUrl(userId)

    await classifyBatch(userId, [
      {
        id: urlId,
        sessionId,
        url: "https://twitter.com/home",
        hostname: "twitter.com",
        title: "Twitter",
      },
    ])

    const [row] = await db
      .select({ score: sessionUrls.distractionScore })
      .from(sessionUrls)
      .where(eq(sessionUrls.id, urlId))
      .limit(1)
    expect(row!.score).toBeNull()
  })
})
