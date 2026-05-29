import { describe, expect, it } from "vitest"
import {
  computePopoverPosition,
  type PopoverGeometryInput,
} from "@/content/toolbar/popover-position"

// A 320px panel (+1px border each side) anchored next to a toolbar button.
const base: Omit<PopoverGeometryInput, "anchor" | "side"> = {
  panel: { width: 322, height: 400 },
  viewport: { width: 1280, height: 800 },
  margin: 8,
  edge: 8,
}

const fitsHorizontally = (
  left: number,
  panelW: number,
  viewportW: number,
  edge: number,
) => left >= edge && left + panelW <= viewportW - edge

describe("computePopoverPosition", () => {
  it("places the panel to the right of a left-docked button when there is room", () => {
    const { top, left } = computePopoverPosition({
      ...base,
      side: "left",
      anchor: { top: 100, left: 12, right: 44 },
    })
    // right of the button: anchor.right (44) + margin (8)
    expect(left).toBe(52)
    // aligns to the button top when it fits vertically
    expect(top).toBe(100)
  })

  it("places the panel to the left of a right-docked button when there is room", () => {
    const { left } = computePopoverPosition({
      ...base,
      side: "right",
      anchor: { top: 100, left: 1236, right: 1268 },
    })
    // left of the button: anchor.left (1236) - margin (8) - width (322)
    expect(left).toBe(906)
    expect(fitsHorizontally(left, base.panel.width, base.viewport.width, base.edge)).toBe(true)
  })

  it("flips to the other side rather than overflow the right edge (left-docked, button near right edge)", () => {
    const { left } = computePopoverPosition({
      ...base,
      side: "left",
      anchor: { top: 100, left: 1200, right: 1232 },
    })
    // would overflow on the right, so flip to the left of the button
    expect(left).toBe(870)
    expect(fitsHorizontally(left, base.panel.width, base.viewport.width, base.edge)).toBe(true)
  })

  it("flips to the other side rather than overflow the left edge (right-docked, button near left edge)", () => {
    const { left } = computePopoverPosition({
      ...base,
      side: "right",
      anchor: { top: 100, left: 12, right: 44 },
    })
    // would overflow on the left, so flip to the right of the button
    expect(left).toBe(52)
    expect(fitsHorizontally(left, base.panel.width, base.viewport.width, base.edge)).toBe(true)
  })

  it("clamps the top so the panel does not overflow the bottom edge", () => {
    const { top } = computePopoverPosition({
      ...base,
      side: "left",
      anchor: { top: 700, left: 12, right: 44 },
    })
    // maxTop = 800 - 400 - 8 = 392
    expect(top).toBe(392)
  })

  it("never overflows the top edge", () => {
    const { top } = computePopoverPosition({
      ...base,
      side: "left",
      anchor: { top: -50, left: 12, right: 44 },
    })
    expect(top).toBe(8)
  })

  it("pins to the top edge when the panel is taller than the viewport", () => {
    const { top } = computePopoverPosition({
      ...base,
      panel: { width: 322, height: 900 },
      side: "left",
      anchor: { top: 100, left: 12, right: 44 },
    })
    expect(top).toBe(8)
  })

  it("pins to the left edge when the panel is wider than the viewport", () => {
    const { left } = computePopoverPosition({
      ...base,
      panel: { width: 1400, height: 400 },
      side: "left",
      anchor: { top: 100, left: 12, right: 44 },
    })
    expect(left).toBe(8)
  })
})
