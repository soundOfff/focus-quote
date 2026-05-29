import { describe, it, expect } from "vitest"
import { parseGuideSteps, type GuidePageElement } from "../src/lib/llm"

const catalog: GuidePageElement[] = [
  { ref: 0, role: "button", label: "Open menu", x: 0.95, y: 0.04 },
  { ref: 1, role: "link", label: "Settings", x: 0.5, y: 0.6 },
]

describe("parseGuideSteps", () => {
  it("uses the catalog element's authoritative coordinates when a step references a valid ref", () => {
    // The model echoes wrong x/y on purpose — the real element wins.
    const text = JSON.stringify({
      steps: [
        { ref: 1, instruction: "Click Settings", description: "Go to settings", x: 0.1, y: 0.1 },
      ],
    })
    const steps = parseGuideSteps(text, catalog)
    expect(steps).toHaveLength(1)
    expect(steps[0]?.ref).toBe(1)
    expect(steps[0]?.x).toBeCloseTo(0.5)
    expect(steps[0]?.y).toBeCloseTo(0.6)
  })

  it("does NOT inset-clamp real element coordinates (edge controls stay at the edge)", () => {
    const text = JSON.stringify({
      steps: [
        { ref: 0, instruction: "Open menu", description: "Top-right menu", x: 0.5, y: 0.5 },
      ],
    })
    const steps = parseGuideSteps(text, catalog)
    // 0.04 would be pushed to 0.02..0.98's lower bound (0.04 is fine here) but
    // crucially it is taken from the catalog, not clamped to a guess.
    expect(steps[0]?.x).toBeCloseTo(0.95)
    expect(steps[0]?.y).toBeCloseTo(0.04)
  })

  it("drops an out-of-range ref to null and falls back to the model's estimate", () => {
    const text = JSON.stringify({
      steps: [
        { ref: 999, instruction: "Click thing", description: "somewhere", x: 0.3, y: 0.7 },
      ],
    })
    const steps = parseGuideSteps(text, catalog)
    expect(steps[0]?.ref).toBeNull()
    expect(steps[0]?.x).toBeCloseTo(0.3)
    expect(steps[0]?.y).toBeCloseTo(0.7)
  })

  it("treats a null ref as an estimate and inset-clamps it to 0.02..0.98", () => {
    const text = JSON.stringify({
      steps: [
        { ref: null, instruction: "Scroll down", description: "below the fold", x: 1.5, y: -0.4 },
      ],
    })
    const steps = parseGuideSteps(text, catalog)
    expect(steps[0]?.ref).toBeNull()
    expect(steps[0]?.x).toBeCloseTo(0.98)
    expect(steps[0]?.y).toBeCloseTo(0.02)
  })

  it("works with no catalog (legacy path): every step is a clamped estimate", () => {
    const text = JSON.stringify({
      steps: [
        { instruction: "Click profile", description: "top right", x: 0.95, y: 0.06 },
      ],
    })
    const steps = parseGuideSteps(text)
    expect(steps[0]?.ref).toBeNull()
    expect(steps[0]?.x).toBeCloseTo(0.95)
    expect(steps[0]?.y).toBeCloseTo(0.06)
  })

  it("skips malformed steps and caps the list at 10", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      instruction: `Step ${i}`,
      description: `desc ${i}`,
      x: 0.5,
      y: 0.5,
    }))
    const text = JSON.stringify({
      steps: [
        { instruction: "no coords" }, // missing description + coords -> dropped
        { description: "no instruction", x: 0.5, y: 0.5 }, // dropped
        ...many,
      ],
    })
    const steps = parseGuideSteps(text)
    expect(steps).toHaveLength(10)
    expect(steps.every((s) => s.instruction.startsWith("Step"))).toBe(true)
  })

  it("returns [] for non-array / unparseable shapes", () => {
    expect(parseGuideSteps(JSON.stringify({ steps: "nope" }))).toEqual([])
    expect(parseGuideSteps(JSON.stringify({ notSteps: [] }))).toEqual([])
  })

  it("truncates very long instruction/description to 240 chars", () => {
    const long = "x".repeat(500)
    const text = JSON.stringify({
      steps: [{ instruction: long, description: long, x: 0.5, y: 0.5 }],
    })
    const steps = parseGuideSteps(text)
    expect(steps[0]?.instruction.length).toBe(240)
    expect(steps[0]?.description.length).toBe(240)
  })
})
