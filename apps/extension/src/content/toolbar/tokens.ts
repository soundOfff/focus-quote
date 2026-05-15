/**
 * FocusQuote design tokens used by the in-page floating UI (rail + panels +
 * selection bar). Mirrors the Direction A handoff in
 * `apps/extension/assets/design_handoff_tools/TOKENS.md`.
 *
 * Two layers:
 *   1. RAW Direction A keys (`paper`, `paper2`, `popupBorder`, `amberSoft`,
 *      `amberDeep`, `amberGradFrom/To`, `blueInk`, `sageInk`, `clayInk`, …)
 *      — preferred for new code.
 *   2. LEGACY keys (`navy`, `navyDeep`, `teal`, `tealDim`, `accent`,
 *      `accentDim`, `hairline`, `ink`, `inkMute`) — point at the new
 *      values so existing modules (`shell.ts`, `quoteAi.ts`, `annotate.ts`,
 *      `guide.ts`, `popover.ts`) inherit the new look without per-file edits.
 *
 * Content scripts can't reuse the extension's CSS variables (host pages
 * have their own styles), so every value is a concrete hex string and the
 * font stacks list system fallbacks before Geist/Newsreader/JetBrains Mono.
 * The @fontsource webfonts only load on extension pages; host pages will
 * gracefully fall back to system stacks here.
 */

// -- Direction A raw palette -------------------------------------------------
const paper = "#FBFAF6"
const paper2 = "#F4F2EC"
const ink = "#1A1814"
const ink2 = "#3A362F"
const muted = "#807A6F"
const muted2 = "#B5AEA0"
const rule = "#E5E0D5"
const rule2 = "#D9D3C5"
const popupBorder = "#DAD3C2"
const amber = "#F2A03C"
const amberDeep = "#C77A1F"
const amberSoft = "#FBE6C8"
const amberHairline = "#ECCE9E"
const amberGradFrom = "#F4AC4F"
const amberGradTo = "#EE9B30"
const blueSoft = "#E0EBF1"
const blueInk = "#2E5C73"
const sageSoft = "#E1EBDF"
const sageInk = "#4A6A47"
const claySoft = "#F2DDD3"
const clayInk = "#A04B26"
const clayHairline = "#E8C7B7"

export const tokens = {
  // -- Direction A raw tokens (preferred) -----------------------------------
  paper,
  paper2,
  ink,
  ink2,
  muted,
  muted2,
  rule,
  rule2,
  popupBorder,
  amber,
  amberDeep,
  amberSoft,
  amberHairline,
  amberGradFrom,
  amberGradTo,
  amberGradient: `linear-gradient(180deg, ${amberGradFrom} 0%, ${amberGradTo} 100%)`,
  blueSoft,
  blueInk,
  sageSoft,
  sageInk,
  claySoft,
  clayInk,
  clayHairline,

  // -- Composite shadows ----------------------------------------------------
  shadowPopup:
    "0 1px 0 rgba(255,255,255,0.7) inset, 0 14px 30px -10px rgba(40,30,15,0.22), 0 3px 8px -2px rgba(40,30,15,0.10)",
  shadowPanel:
    "0 1px 0 rgba(255,255,255,0.7) inset, 0 18px 36px -12px rgba(40,30,15,0.22), 0 3px 10px -2px rgba(40,30,15,0.10)",
  shadowToolbar:
    "0 1px 0 rgba(255,255,255,0.7) inset, 0 14px 32px -10px rgba(40,30,15,0.22), 0 3px 8px -2px rgba(40,30,15,0.10)",
  shadowAmber:
    "0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(40,30,15,0.15)",
  shadowSegmented: "0 1px 2px rgba(40,30,15,0.08)",

  // -- Legacy aliases. Modules that import `tokens.navy` etc. resolve through
  // -- these and pick up the new look automatically.
  navy: paper,
  navyDeep: paper2,
  teal: sageInk,
  tealDim: popupBorder,
  accent: amberDeep,
  accentDim: amberHairline,
  hairline: rule,
  inkMute: muted,

  // Spacing scale.
  space: {
    xxs: "2px",
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    xxl: "32px",
  },
  // Radius scale.
  radius: "7px", // small inline buttons / chips
  radiusMd: "10px", // toolbars + cards
  radiusLg: "12px", // panels
  radiusPill: "9999px",
  // Touch-target & icon sizes.
  size: {
    tap: "34px", // rail buttons (34 wide × 32 tall)
    tapH: "32px",
    sideToggleH: "28px",
    badge: "7px",
  },
  icon: {
    sm: 13,
    md: 15, // rail icons per the handoff
    lg: 18,
  },
  // Z-index ladder.
  zToolbar: 2147483640,
  zPopover: 2147483641,
  zOverlay: 2147483642,
  zCursor: 2147483643,
  // Font stacks. Geist/Newsreader/JetBrains Mono come first — they'll resolve
  // on host pages that happen to have them (rare); otherwise the system
  // stack picks up.
  font:
    '13px/1.4 "Geist",system-ui,-apple-system,"Segoe UI","Helvetica Neue",sans-serif',
  fontMono:
    '12px/1.4 "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  fontSerif:
    '13px/1.45 "Newsreader","Iowan Old Style",Georgia,"Times New Roman",serif',
  /**
   * Scrollbars — transparent track, hairline thumb. Used by injected
   * `[data-fq-scrollbar]` rules on host pages.
   */
  scrollbar: {
    track: "transparent",
    thumb: "rgba(128,122,111,0.45)",
    thumbHover: "rgba(128,122,111,0.75)",
  },
} as const
