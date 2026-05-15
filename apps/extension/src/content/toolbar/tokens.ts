/**
 * FocusQuote design tokens used by the in-page toolbar and its popovers.
 * Mirrors the spacing / sizing scale from `apps/DESIGN.MD`:
 *
 *   - 8px base spacing with finer 2/4/6px steps for tight inline gaps
 *   - {spacing.xxs..xxl} = 2 / 4 / 8 / 12 / 16 / 24 / 32 px
 *   - {rounded.sm} = 4px for inline buttons & form inputs
 *   - {rounded.md} = 6px for cards & CTAs
 *   - touch targets meet WCAG AA at >= 40x40 (`size.tap`)
 *   - product icon scale = 20–24px (`icon.md` = 20)
 *
 * Colors stay in the toolbar's own dark navy palette (DESIGN.MD doesn't
 * cover dark in-page chrome), but everything *measurable* — spacing,
 * radius, icon size, target size, hairline — comes from the scale below.
 */

export const tokens = {
  navy: "#16213e",
  navyDeep: "#0f1a30",
  teal: "#2dd4bf",
  tealDim: "rgba(45, 212, 191, 0.5)",
  accent: "#e94560",
  accentDim: "rgba(233, 69, 96, 0.55)",
  ink: "#eaeaea",
  inkMute: "#bcbcbc",
  hairline: "rgba(255, 255, 255, 0.08)",
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
