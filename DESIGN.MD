# FocusQuote — Design System

The source of truth for FocusQuote's UI tokens. Components in `apps/extension/src/ui/primitives.tsx` and in-page chrome in `apps/extension/src/content/toolbar/tokens.ts` both render from this palette. The literal CSS custom-property values live in `apps/extension/src/styles/tailwind.css` — this doc explains *intent* and *usage*.

## Surfaces

A warm-cream page sits behind everything. Cards rise on top with no shadow, only a single hairline border. Dark mode flips the same shapes onto a near-black canvas with the same warm hairline relationships.

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `rgb(238 239 233)` | `rgb(18 20 15)` | Page background. Edge-to-edge, never gradients. |
| `surface` | `rgb(255 255 255)` | `rgb(26 29 23)` | Cards. The dominant raised surface. |
| `surface-soft` | `rgb(229 231 224)` | `rgb(35 40 32)` | Secondary button fill, hover state for ghost buttons. |
| `surface-doc` | `rgb(252 252 250)` | `rgb(32 36 29)` | Nested doc-like blocks inside a card (e.g. profile sub-card in Account). |
| `hairline` | `rgb(191 193 183)` | `rgb(59 66 54)` | Primary 1px borders on cards & inputs. |
| `hairline-soft` | `rgb(220 223 210)` | `rgb(44 50 40)` | Inner dividers between rows within a card. |

**No shadows.** Cards rely on hairlines and surface differentiation. The only exceptions are toasts and floating popovers, which use `0 4px 14px rgba(0,0,0,.10)` so they read as detached from the page.

## Text

| Token | Light | Dark | Use |
|---|---|---|---|
| `ink` | `rgb(35 37 29)` | `rgb(243 245 237)` | Headings + primary text. |
| `body` | `rgb(77 79 70)` | `rgb(208 213 199)` | Paragraph body. |
| `mute` | `rgb(108 110 99)` | `rgb(155 163 143)` | Labels, captions, helper text. |

Typography is system-ui (`13px/1.4` in the toolbar; Tailwind defaults elsewhere). No webfont. Headings use weight 600–700; body 400; tabular-nums for any digit-led metric (timer, counts, durations).

## Accents

The brand's only saturated chromatic moment is the **yellow-orange primary**. Use it for the single most important action in a view (the "Start focus session" CTA, the active nav indicator, the save-quote selection bar). Greens / reds / blues are reserved for status, not decoration.

| Token | Light | Dark | Use |
|---|---|---|---|
| `primary` | `rgb(247 165 1)` | `rgb(247 165 1)` | Single primary CTA, save-quote bar, active nav underline. |
| `primary-pressed` | `rgb(221 144 1)` | `rgb(212 141 22)` | Pressed/hover for the primary pill. |
| `accent-green` / `…-soft` | `rgb(44 140 102)` / `rgb(217 237 223)` | inverted | Success badges (completed sessions), success toasts. |
| `accent-red` / `…-soft` | `rgb(205 66 57)` / `rgb(247 214 211)` | inverted | Cancel/error badges, destructive icons, error toasts. |
| `link-blue` | `rgb(29 78 216)` | `rgb(143 180 255)` | Hyperlinks only. |
| `focus-ring` | `rgb(59 130 246)` | `rgb(147 197 253)` | Keyboard-focus 2px ring (`ring-focus-ring/70`). |

## Spacing & radius

8px base grid. Use 2/4/6 only for tight inline groupings (icon-to-label gaps inside a button).

| Scale | Value | Use |
|---|---|---|
| `xxs` | 2px | Selection bar internal padding. |
| `xs` | 4px | Inline gaps inside toolbar buttons. |
| `sm` | 8px | Card internal padding rows. |
| `md` | 12px | Standard component gap. |
| `lg` | 16px | Surface (card) padding. |
| `xl` | 24px | Section gap between Surfaces. |
| `xxl` | 32px | Page-level breathing room. |

**Radius**: `4px` for inline buttons & inputs, `6px` for cards/CTAs/popover panels, fully rounded for pill chips (badges, tabs).

## Touch targets & icon scale

40 × 40 px minimum tap target (WCAG AA). Toolbar buttons and primary CTAs hit this; inline icon buttons in a packed row may relax to 28 × 28 with sufficient hit-padding.

Icons: 12px in dense rows (Badge content, popup header buttons), 14px standard (Button leading icon), 16px ghost icon buttons, 20–24px in the in-page toolbar.

## Components

- `Surface` — rounded card with a hairline border. The default container.
- `Button` — variants: `primary` (yellow pill), `secondary` (soft fill), `outline` (hairline only), `ghost` (transparent + hover). Sizes `sm` (h-8) and `md` (h-10).
- `Badge` — pill with tone (`success` / `danger` / `warning` / `info` / `neutral`).
- `Tabs` + `TabPanel` — pill row at the top of a tabbed view. Used in Options.
- `Skeleton` / `SkeletonCard` — animated placeholders during load.
- `Toggle` — boolean switch using primary as the "on" state.
- `Toast` — floating success/error/info, bottom-right, 2.5s auto-dismiss.

## Scrollbars

Scrollable regions use a **thin** bar with a **transparent track** (no gutter fill) so the canvas/surface shows through. The thumb uses the warm **hairline** tone at ~70% opacity; hover darkens toward **mute**. Light and dark themes each map thumb opacity to the same tokens so contrast stays balanced on `canvas` / `surface`.

| Surface | Thumb | Track |
|---------|--------|--------|
| Light | `hairline` @ ~0.72 α | `transparent` |
| Dark | `hairline` @ ~0.55 α (darker hairline rgb) | `transparent` |

In-page UI (toolbar, save row, popovers) applies the same colors via `tokens.scrollbar` and the `data-fq-scrollbar` hook (injected stylesheet).

## In-page toolbar conventions

The floating toolbar lives on arbitrary web pages, so it must read against any background. Same palette as the rest of the app, plus:

- 40 × 40 hit targets (`tokens.size.tap`).
- 4px radius for inline buttons (`tokens.radius`).
- 6px radius for popover panels (`tokens.radiusMd`).
- No drop shadow on the toolbar itself; popovers + the save-quote bar use a subtle 0 4px 14px shadow at 10% opacity to detach from the page.
- z-index ladder: toolbar `2147483640`, popover `…41`, overlay (annotate canvas) `…42`, cursor (guide me) `…43`, toast `…47`.

## Navigation

`AppShell` provides a shared header for the newtab, options, and session-detail pages. Brand left, text+icon links (Home / Options), theme toggle right. Active link uses `text-ink` plus a 2px `bg-primary` underline (`after:` pseudo). Popup keeps its own compact header (no shared nav) because the 360 × 460 surface is too narrow.

## Density

Pages must fit the viewport without page-level scroll. Specific scrollable regions live inside cards (`flex-1 min-h-0 overflow-y-auto`). The popup is fixed at 360 × 460 with a single internal scroll for the quote list.
