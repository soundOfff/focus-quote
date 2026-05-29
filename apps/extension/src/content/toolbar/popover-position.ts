import type { ToolbarSide } from "./shell"

export interface PopoverGeometryInput {
  /** Anchor button rect (viewport coordinates). */
  anchor: { top: number; left: number; right: number }
  /** Measured panel size including borders. */
  panel: { width: number; height: number }
  /** Current viewport size. */
  viewport: { width: number; height: number }
  /** Which edge the tool rail is docked to. */
  side: ToolbarSide
  /** Gap between the button and the panel. */
  margin: number
  /** Minimum gap kept from the viewport edges. */
  edge: number
}

export interface PopoverGeometry {
  top: number
  left: number
}

/**
 * Compute a viewport-safe position for a popover anchored next to a toolbar
 * button. The panel prefers the open side of the rail (right of the button
 * when docked left, left of the button when docked right), flips to the other
 * side if it would overflow, and is finally clamped so it never leaves the
 * viewport on any edge.
 */
export const computePopoverPosition = (
  input: PopoverGeometryInput,
): PopoverGeometry => {
  const { anchor, panel, viewport, side, margin, edge } = input

  const rightOfAnchor = anchor.right + margin
  const leftOfAnchor = anchor.left - margin - panel.width

  let left: number
  if (side === "right") {
    // Rail docked right → prefer placing the panel to the left of the button.
    left = leftOfAnchor >= edge ? leftOfAnchor : rightOfAnchor
  } else {
    // Rail docked left → prefer placing the panel to the right of the button.
    left =
      rightOfAnchor + panel.width <= viewport.width - edge
        ? rightOfAnchor
        : leftOfAnchor
  }

  // Final horizontal clamp — guarantees on-screen even when neither side fits.
  const maxLeft = Math.max(edge, viewport.width - panel.width - edge)
  left = Math.max(edge, Math.min(maxLeft, left))

  // Vertical: align to the button top, clamped within the viewport.
  const maxTop = Math.max(edge, viewport.height - panel.height - edge)
  const top = Math.max(edge, Math.min(maxTop, anchor.top))

  return { top, left }
}
