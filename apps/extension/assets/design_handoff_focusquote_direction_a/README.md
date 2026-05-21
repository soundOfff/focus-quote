# Handoff — FocusQuote popup redesign (Direction A · "Editorial Column")

## Overview
This bundle contains the design reference for rebuilding the FocusQuote browser-extension popup, settings screen, and in-page text-selection toolbar in **Direction A — Editorial Column**. It matches the existing FocusQuote web dashboard's aesthetic (warm paper, serif display, mono labels, single amber action) so the popup reads as the same product.

## About the design files
The files in `design_files/` are **design references created in HTML/React** — prototypes that show the intended look and behavior. **Do not ship the HTML directly** and do not copy the JSX wholesale. Your job is to recreate these designs inside the FocusQuote extension's existing codebase, using its established framework, component patterns, build pipeline, and conventions. If the extension's UI layer is Tailwind, port to Tailwind classes; if it uses CSS-modules, port to CSS-modules; etc.

## Fidelity
**High-fidelity.** Exact colors, fonts, sizes, spacing, radii, shadows, and copy are specified below. Reproduce pixel-perfectly. The only liberty: swap component implementations to match your codebase's primitives.

---

## Files in this bundle

```
design_handoff_focusquote_direction_a/
├── README.md                       ← this file (read first)
├── TOKENS.md                       ← design tokens (CSS variables + raw values)
├── COMPONENTS.md                   ← component-by-component anatomy
├── COPY.md                         ← exact strings used
└── design_files/
    ├── FocusQuote Popup.html       ← full canvas (open in browser to see all 3 directions)
    ├── variant-a.jsx               ← Direction A popup + settings JSX (reference only)
    ├── variant-a-selection.jsx     ← Direction A selection toolbar JSX (reference only)
    └── icons.jsx                   ← stroke icon set used across Direction A
```

Open `design_files/FocusQuote Popup.html` in a browser to see Direction A in context (top section). The two `variant-a*.jsx` files are the source for that rendering — use them to read exact paddings, sizes, and color usage when this README is ambiguous.

---

## Three surfaces to build

### 1. Popup (extension toolbar popup) — `380 × ~760 px`
The default view when the user clicks the extension icon. Three vertical regions:

1. **Header bar** — wordmark `Focus` + amber `Quote`, mono date "FRI · MAY 15", gear icon. 1px bottom rule.
2. **Today's Intent band** — paper-2 tinted band. Mono small-caps "TODAY'S INTENT" label (blue ink), then a single-line bold sentence. 1px bottom rule.
3. **Focus session** — section label, goal input, segmented `[15 | 25 | 45]` duration selector, amber primary button "Start 25-min session", live stats row (streak · today · saved quotes).
4. **Saved quotes drawer** — paper-2 background. Section label + total + "All →" link. Search input. Vertical scrollable list of quote cards.

### 2. Settings — `380 × ~880 px`
Same chrome (header bar with Back · Settings · spacer instead of brand · gear). Sections, each preceded by a mono small-caps label:

- **Account** — avatar tile (amber-soft circle, initials), name + email, ghost "Sign out" button.
- **Appearance** — three segmented buttons: Light (active, amber-soft) · Dark · Auto.
- **Session defaults** — two cards side-by-side: Focus / Break, each with `[−]  25  [+]` stepper.
- **Translation** — two cards: From / To, each showing language + chevron-right.
- **Storage** — local cache row with progress bar (amber).

### 3. Selection toolbar (in-page popover) — auto width × `~38 px`
Floats above selected text on any web page. Single row pill containing:

1. Amber **"Save quote"** primary button (bookmark icon + label).
2. Hairline divider.
3. **From** language chip (mono label "FROM" small-caps above language name + ISO code badge + chevron-down).
4. Passive arrow `→` cap.
5. **To** language chip (same anatomy).
6. Hairline divider.
7. Globe icon button (translate selection).
8. Tag icon ghost button (overflow).

States:
- **Default** — as above.
- **Saved** — primary button replaced by sage-soft pill with check icon and label "Saved".
- **Language menu open** — dropdown drops from the To chip: mono small-caps "TRANSLATE TO" header, search input, list of languages each with check (if active) + name + ISO badge.

---

## Implementation notes

- **Single amber action per surface.** Never show two amber buttons at once. Any other action is a ghost button (paper-2 fill, 1px rule-2 border, ink-2 text).
- **Mono small-caps** (JetBrains Mono, 9.5–11px, `letter-spacing: 0.12em`, `text-transform: uppercase`, color `--muted`) is used for: section labels, dates, ids, source attribution, ISO codes. Never use it for body or button labels.
- **Newsreader serif** appears at "serif moments": the wordmark, settings page heading, quote titles in the saved-quotes list, and any pull-quote body. Everything else is Geist sans.
- **Hairline rules** (`1px solid var(--rule)`) separate regions vertically inside the popup. Use them in place of card shadows.
- **Soft tinted callouts** (blue-soft / sage-soft / clay-soft) carry status only — info, success, danger. Don't use them as decoration.
- **Avatars** are amber-soft circles with mono initials and an amber border — not user photos.
- **The popup's outer container** has a 14px radius, a 1px `#DAD3C2` border, and a layered shadow:
  `0 1px 0 rgba(255,255,255,0.7) inset, 0 12px 28px -12px rgba(40,30,15,0.18), 0 2px 6px -2px rgba(40,30,15,0.10)`.
  In a Chrome extension this won't render outside the popup window — but apply it anyway so the design ports cleanly to other surfaces (web app modals, etc.).

---

## Fonts

Self-host or load via Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

- **Newsreader** (serif) — display moments
- **Geist** (sans) — interface body
- **JetBrains Mono** (mono) — labels, ids, codes

---

## Assets
- Icons: stroke icons at 1.6 stroke-width, 16px default. See `design_files/icons.jsx` for the full set used; reproduce as inline SVG components or use Lucide React (`Bookmark`, `Settings`, `Search`, `Timer`, `Flame`, `Play`, `ArrowRight`, `ArrowLeft`, `Plus`, `Minus`, `Check`, `Sun`, `Moon`, `User`, `LogOut`, `Target`, `Globe`, `Tag`, `ChevronRight`, `Edit3` would all be reasonable mappings).
- No raster assets.
- No brand logos beyond the wordmark "Focus**Quote**" rendered in Newsreader 600 with the "Quote" half in `--amber-deep`.

---

## Next files to read
1. `TOKENS.md` — exact colors, spacing, radii, type scale.
2. `COMPONENTS.md` — anatomy per component.
3. `COPY.md` — every string used.
