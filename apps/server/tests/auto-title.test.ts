import { describe, it, expect } from "vitest"
import { and, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../src/db/client"
import { focusSessions, sessionUrls } from "../src/db/schema"
import { aiFeatureEnabledForUser } from "../src/lib/ai-gate"
import { maybeGenerateTitle } from "../src/lib/topic"
import { authedFetch, createTestUser, json } from "./helpers"

const baseSettings = {
  theme: "dark" as const,
  defaultDurationMinutes: 25,
  defaultBreakMinutes: 5,
  translateFromLang: "auto",
  translateToLang: "en",
}

const insertSession = async (userId: string, goal: string | null) => {
  const id = randomUUID()
  await db.insert(focusSessions).values({ id, userId, goal })
  return id
}

const insertUrl = async (userId: string, sessionId: string, url: string) => {
  await db.insert(sessionUrls).values({
    id: randomUUID(),
    userId,
    sessionId,
    url,
    hostname: new URL(url).hostname,
    title: url,
  })
}

const readTitle = async (userId: string, sessionId: string) => {
  const [row] = await db
    .select({ title: focusSessions.title, goal: focusSessions.goal })
    .from(focusSessions)
    .where(
      and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
    )
    .limit(1)
  return row
}

const enableAutoTitle = (token: string, enabled: boolean) =>
  authedFetch(token)("/api/settings", {
    ...json({ ...baseSettings, autoTitleEnabled: enabled }),
    method: "PUT",
  })

describe("autoTitle AI gate (issue #9)", () => {
  it("is opt-in: off by default even with the master switch on", async () => {
    const { userId } = await createTestUser()
    // No settings row → master defaults on, but autoTitle is "auto" tier (off).
    expect(await aiFeatureEnabledForUser(userId, "autoTitle")).toBe(false)
  })

  it("turns on once the per-feature toggle is persisted", async () => {
    const { userId, token } = await createTestUser()
    expect((await enableAutoTitle(token, true)).status).toBe(200)
    expect(await aiFeatureEnabledForUser(userId, "autoTitle")).toBe(true)
  })

  it("stays off when the master switch is off, regardless of the toggle", async () => {
    const { userId, token } = await createTestUser()
    const put = await authedFetch(token)("/api/settings", {
      ...json({
        ...baseSettings,
        aiMasterEnabled: false,
        autoTitleEnabled: true,
      }),
      method: "PUT",
    })
    expect(put.status).toBe(200)
    expect(await aiFeatureEnabledForUser(userId, "autoTitle")).toBe(false)
  })

  it("round-trips autoTitleEnabled through GET /api/settings", async () => {
    const { token } = await createTestUser()
    await enableAutoTitle(token, true)
    const get = await authedFetch(token)("/api/settings")
    const body = (await get.json()) as {
      settings: { autoTitleEnabled: boolean }
    }
    expect(body.settings.autoTitleEnabled).toBe(true)
  })
})

describe("maybeGenerateTitle (issue #9)", () => {
  it("never touches a session that already has a goal", async () => {
    const { userId, token } = await createTestUser()
    await enableAutoTitle(token, true)
    const sessionId = await insertSession(userId, "Learn the borrow checker")
    await insertUrl(userId, sessionId, "https://doc.rust-lang.org/book/")

    await maybeGenerateTitle(userId, sessionId)

    const row = await readTitle(userId, sessionId)
    expect(row?.title).toBeNull() // goal owns the label
    expect(row?.goal).toBe("Learn the borrow checker") // goal untouched
  })

  it("does nothing when the feature is disabled (default)", async () => {
    const { userId } = await createTestUser()
    const sessionId = await insertSession(userId, null)
    await insertUrl(userId, sessionId, "https://example.com/article")

    await maybeGenerateTitle(userId, sessionId)

    const row = await readTitle(userId, sessionId)
    expect(row?.title).toBeNull() // gated off → no write, no tokens
  })
})
