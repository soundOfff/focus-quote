/**
 * FocusQuote design tokens used by the in-page toolbar and its popovers.
 * Mirrors `apps/DESIGN.MD` and `src/styles/tailwind.css` so the in-page
 * chrome matches the rest of the extension UI: cream/white surfaces, ink
 * text, yellow primary accent, warm hairlines.
 *
 *   - 8px base spacing with finer 2/4/6px steps for tight inline gaps
 *   - {spacing.xxs..xxl} = 2 / 4 / 8 / 12 / 16 / 24 / 32 px
 *   - {rounded.sm} = 4px for inline buttons & form inputs
 *   - {rounded.md} = 6px for cards & CTAs
 *   - touch targets meet WCAG AA at >= 40x40 (`size.tap`)
 *   - product icon scale = 20–24px (`icon.md` = 20)
 *
 * Names kept for historical reasons; values now come from the cream/ink
 * palette in the global Tailwind layer.
 */

export const tokens = {
  // Surfaces (was the navy backdrop). Now matches the app's surface-doc
  // and surface cards so the toolbar feels like part of the same product.
  navy: "rgb(255 255 255)", // surface
  navyDeep: "rgb(238 239 233)", // canvas
  // "teal" historically marked active/positive states. Now maps to the
  // success-green pair so the toolbar can still flash a "good" highlight.
  teal: "rgb(44 140 102)",
  tealDim: "rgba(44, 140, 102, 0.45)",
  // "accent" is the product's primary call-to-action — yellow-orange.
  accent: "rgb(247 165 1)",
  accentDim: "rgba(247, 165, 1, 0.45)",
  // Text. Was a near-white off-dark; now the warm ink + mute used by the
  // rest of the app.
  ink: "rgb(35 37 29)",
  inkMute: "rgb(110 113 99)",
  // Hairline border — same warm tone as the global `--color-hairline`.
  hairline: "rgb(191 193 183)",
  // Spacing scale (DESIGN.MD `{spacing.*}`).
  space: {
    xxs: "2px",
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    xxl: "32px",
  },
  // Radius scale (DESIGN.MD `{rounded.*}`).
  radius: "4px", // {rounded.sm} — default for inline buttons/inputs
  radiusMd: "6px", // {rounded.md} — cards, CTAs, popover panels
  // Touch-target & icon sizes.
  size: {
    tap: "40px", // WCAG AA minimum, also the standard button height
    sideToggleH: "28px", // shorter chevron at the bottom of the toolbar
    badge: "7px",
  },
  icon: {
    sm: 16,
    md: 20, // canonical for product toolbar icons (DESIGN.MD 20–24px range)
    lg: 24,
  },
  // We compose the floating UI on top of (almost) every page. Use a value
  // that's high enough to defeat sticky headers but lower than the toast
  // (`2147483647`) so toasts can still pop over us.
  zToolbar: 2147483640,
  zPopover: 2147483641,
  zOverlay: 2147483642,
  zCursor: 2147483643,
  font: '13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif',
  fontMono: '12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
} as const
