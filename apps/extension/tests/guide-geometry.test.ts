import { describe, it, expect } from "vitest"
import {
  resolveGuidePoint,
  goalTokens,
  rankCandidates,
  labelMatchesStep,
} from "@/content/toolbar/guide-geometry"

describe("resolveGuidePoint", () => {
  const viewport = { w: 1000, h: 800 }

  it("uses the live element's measured center when a rect is provided", () => {
    const p = resolveGuidePoint(
      { x: 0.1, y: 0.1 },
      { left: 200, top: 100, width: 40, height: 20 },
      viewport,
    )
    expect(p).toEqual({ x: 220, y: 110 })
  })

  it("falls back to the stored normalized coords when there is no live rect", () => {
    const p = resolveGuidePoint({ x: 0.5, y: 0.25 }, null, viewport)
    expect(p).toEqual({ x: 500, y: 200 })
  })

  it("falls back when the live rect has zero size (detached / collapsed)", () => {
    const p = resolveGuidePoint(
      { x: 0.5, y: 0.5 },
      { left: 0, top: 0, width: 0, height: 0 },
      viewport,
    )
    expect(p).toEqual({ x: 500, y: 400 })
  })
})

describe("goalTokens", () => {
  it("lowercases and keeps tokens longer than 2 chars", () => {
    expect(goalTokens("Disable my Account NOW")).toEqual([
      "disable",
      "account",
      "now",
    ])
  })

  it("splits on punctuation and drops short words", () => {
    expect(goalTokens("how do I log-out?")).toEqual(["how", "log", "out"])
  })
})

describe("rankCandidates", () => {
  const items = [
    { label: "Home" },
    { label: "Account settings" },
    { label: "Help" },
    { label: "Disable account" },
  ]

  it("floats goal-matching labels ahead of the rest, preserving doc order within groups", () => {
    const ranked = rankCandidates(items, "disable account", 10)
    expect(ranked.map((i) => i.label)).toEqual([
      "Account settings", // matches "account"
      "Disable account", // matches "disable"/"account"
      "Home",
      "Help",
    ])
  })

  it("respects the cap and can drop non-matching items", () => {
    const ranked = rankCandidates(items, "disable account", 2)
    expect(ranked.map((i) => i.label)).toEqual([
      "Account settings",
      "Disable account",
    ])
  })

  it("returns the first N in document order when the goal has no usable tokens", () => {
    const ranked = rankCandidates(items, "?? a", 3)
    expect(ranked.map((i) => i.label)).toEqual(["Home", "Account settings", "Help"])
  })
})

describe("labelMatchesStep", () => {
  const step = {
    instruction: "Click Settings",
    description: "Open the settings menu",
  }

  it("matches when the label appears in the step text", () => {
    expect(labelMatchesStep("Settings", step)).toBe(true)
    expect(labelMatchesStep("settings menu", step)).toBe(true)
  })

  it("does not match an unrelated label", () => {
    expect(labelMatchesStep("Logout", step)).toBe(false)
  })

  it("ignores trivially short labels", () => {
    expect(labelMatchesStep("S", step)).toBe(false)
    expect(labelMatchesStep("  ", step)).toBe(false)
  })
})
