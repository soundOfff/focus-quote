import { describe, it, expect } from "vitest"
import {
  AI_FEATURE_TIERS,
  aiFeatureDefault,
  isAiFeatureEnabled,
  type AiFeature,
} from "@focus-quote/shared"

const ALL = Object.keys(AI_FEATURE_TIERS) as AiFeature[]

describe("aiFeatureDefault", () => {
  it("auto-tier features default off; core and on-demand default on", () => {
    expect(aiFeatureDefault("autoTitle")).toBe(false) // auto
    expect(aiFeatureDefault("distractionDetection")).toBe(true) // core
    expect(aiFeatureDefault("recallQuestions")).toBe(true) // onDemand
  })
})

describe("isAiFeatureEnabled", () => {
  it("disables every feature when the master switch is off", () => {
    for (const f of ALL) {
      expect(isAiFeatureEnabled(f, { masterEnabled: false })).toBe(false)
    }
  })

  it("falls back to tier defaults when there is no override", () => {
    expect(
      isAiFeatureEnabled("distractionDetection", { masterEnabled: true }),
    ).toBe(true)
    expect(isAiFeatureEnabled("quoteAssistant", { masterEnabled: true })).toBe(
      true,
    )
    expect(isAiFeatureEnabled("autoTitle", { masterEnabled: true })).toBe(false)
  })

  it("lets an explicit override beat the tier default", () => {
    expect(
      isAiFeatureEnabled("quoteAssistant", {
        masterEnabled: true,
        featureOverrides: { quoteAssistant: false },
      }),
    ).toBe(false)
    expect(
      isAiFeatureEnabled("autoTitle", {
        masterEnabled: true,
        featureOverrides: { autoTitle: true },
      }),
    ).toBe(true)
  })

  it("keeps the master switch authoritative over an enabling override", () => {
    expect(
      isAiFeatureEnabled("autoTitle", {
        masterEnabled: false,
        featureOverrides: { autoTitle: true },
      }),
    ).toBe(false)
  })
})
