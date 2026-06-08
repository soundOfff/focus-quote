/**
 * Brand-coloured selection for the in-page selection toolbar.
 *
 * Two cooperating mechanisms, used so they are never visible at the same time
 * (no double-paint, no colour shift):
 *
 *   1. NATIVE recolour — a `::selection` rule, scoped to a `<html>` attribute,
 *      repaints the browser's own selection in the brand amber. Because it
 *      restyles the real selection, it applies the instant text is selected
 *      (mid-drag), so the default blue never flashes before the toolbar shows.
 *      This carries the highlight for the entire normal lifetime of the popup.
 *
 *   2. OVERLAY bridge — amber boxes drawn over the selection's client rects.
 *      Used only to *bridge* the moment the native selection is collapsed by
 *      something stealing focus (the language dropdown's filter input). While
 *      the bridge is up the native selection is gone, so the two never stack.
 *
 * Both are torn down by `disableSelectionColor()` when the popup hides.
 */

import { tokens } from "./tokens"

const STYLE_ID = "focusquote-selection-highlight-style"
const OVERLAY_ATTR = "data-focusquote-selection-highlight"
const ACTIVE_ATTR = "data-focusquote-selecting"

// Primary amber (tokens.amber === "#F2A03C"). Translucent so glyphs stay legible
// — the browser composites ::selection under the text, this reads as a marker.
const SELECTION_BG = "rgba(242,160,60,0.40)"
const OVERLAY_BG = "rgba(242,160,60,0.32)"

let overlay: HTMLDivElement | null = null

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement("style")
  style.id = STYLE_ID
  // Scoped to the active attribute so a host page's own selection styling is
  // only overridden while our toolbar is actually engaged.
  style.textContent =
    `html[${ACTIVE_ATTR}] ::selection{background-color:${SELECTION_BG} !important;}` +
    `html[${ACTIVE_ATTR}] ::-moz-selection{background-color:${SELECTION_BG} !important;}`
  ;(document.head || document.documentElement).appendChild(style)
}

/**
 * Turn the brand selection colour on. Idempotent — call as soon as a selection
 * exists (mid-drag) so the colour applies before the default blue can show.
 */
export const enableSelectionColor = (): void => {
  ensureStyle()
  document.documentElement?.setAttribute(ACTIVE_ATTR, "")
}

/** Turn the brand colour off and tear down any bridge overlay. */
export const disableSelectionColor = (): void => {
  document.documentElement?.removeAttribute(ACTIVE_ATTR)
  clearBridge()
}

const ensureOverlay = (): HTMLDivElement => {
  if (overlay && overlay.isConnected) return overlay
  const el = document.createElement("div")
  el.setAttribute(OVERLAY_ATTR, "")
  el.style.cssText = [
    "all:initial",
    "position:fixed",
    "left:0",
    "top:0",
    "right:0",
    "bottom:0",
    "pointer-events:none",
    // Behind the toolbar/dropdown but above page content.
    `z-index:${tokens.zToolbar - 1}`,
  ].join(";")
  ;(document.documentElement || document.body).appendChild(el)
  overlay = el
  return el
}

/**
 * Paint amber boxes over the range to *bridge* the highlight while the native
 * selection is collapsed (e.g. the lang dropdown's filter input has focus).
 * Safe to call repeatedly — the previous paint is replaced.
 */
export const paintBridge = (range: Range): void => {
  const host = ensureOverlay()
  host.innerHTML = ""
  const rects = range.getClientRects()
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    if (!r || r.width === 0 || r.height === 0) continue
    const box = document.createElement("div")
    box.style.cssText = [
      "position:absolute",
      `left:${r.left}px`,
      `top:${r.top}px`,
      `width:${r.width}px`,
      `height:${r.height}px`,
      `background-color:${OVERLAY_BG}`,
      "border-radius:2px",
      "pointer-events:none",
    ].join(";")
    host.appendChild(box)
  }
}

/** Remove the bridge overlay (the native colour, if active, stays). */
export const clearBridge = (): void => {
  if (overlay) {
    overlay.remove()
    overlay = null
  }
}
