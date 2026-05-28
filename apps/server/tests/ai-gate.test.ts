import { describe, it, expect } from "vitest"
import {
  loadAiGateSettings,
  aiFeatureEnabledForUser,
} from "../src/lib/ai-gate"
import { authedFetch, createTestUser, json } from "./helpers"

const baseSettings = {
  theme: "dark" as const,
  defaultDurationMinutes: 25,
  defaultBreakMinutes: 5,
  translateFromLang: "auto",
  translateToLang: "en",
}

describe("server AI gate", () => {
  it("defaults to enabled when the user has no settings row", async () => {
    const { userId } = await createTestUser()
    const gate = await loadAiGateSettings(userId)
    expect(gate.masterEnabled).toBe(true)
    expect(await aiFeatureEnabledForUser(userId, "sessionSummary")).toBe(true)
  })

  it("honors the master switch persisted via the settings route", async () => {
    const { userId, token } = await createTestUser()
    const put = await authedFetch(token)("/api/settings", {
      ...json({ ...baseSettings, aiMasterEnabled: false }),
      method: "PUT",
    })
    expect(put.status).toBe(200)

    const gate = await loadAiGateSettings(userId)
    expect(gate.masterEnabled).toBe(false)
    // Every feature is gated off when the master switch is off.
    expect(await aiFeatureEnabledForUser(userId, "sessionSummary")).toBe(false)
    expect(await aiFeatureEnabledForUser(userId, "recallQuestions")).toBe(false)
    expect(await aiFeatureEnabledForUser(userId, "distractionDetection")).toBe(
      false,
    )
  })

  it("round-trips aiMasterEnabled through GET /api/settings", async () => {
    const { token } = await createTestUser()
    await authedFetch(token)("/api/settings", {
      ...json({ ...baseSettings, aiMasterEnabled: false }),
      method: "PUT",
    })
    const get = await authedFetch(token)("/api/settings")
    const body = (await get.json()) as {
      settings: { aiMasterEnabled: boolean }
    }
    expect(body.settings.aiMasterEnabled).toBe(false)
  })
})
