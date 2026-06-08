/**
 * Brand-coloured selection for the in-page selection toolbar.
 *
 * A single mechanism: a scoped `::selection` rule that repaints the browser's
 * own selection in the brand amber. Because it restyles the *real* selection,
 * the browser composites it under the glyphs (text stays fully legible) and it
 * applies the instant text is selected (mid-drag), so the default blue never
 * flashes before the toolbar appears.
 *
 * It's scoped to a `<html>` attribute so a host page's own selection styling is
 * only overridden while our toolbar is actually engaged. The toolbar keeps the
 * native selection alive for its whole lifetime (the lang dropdown no longer
 * steals focus), so the highlight persists without any overlay.
 */

const STYLE_ID = "focusquote-selection-highlight-style"
const ACTIVE_ATTR = "data-focusquote-selecting"

// Primary amber (tokens.amber === "#F2A03C"). Translucent so glyphs stay legible
// — the browser composites ::selection under the text, this reads as a marker.
const SELECTION_BG = "rgba(242,160,60,0.40)"

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement("style")
  style.id = STYLE_ID
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

/** Turn the brand selection colour off. */
export const disableSelectionColor = (): void => {
  document.documentElement?.removeAttribute(ACTIVE_ATTR)
}
