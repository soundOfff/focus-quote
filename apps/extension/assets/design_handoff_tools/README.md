# Handoff — FocusQuote in-page tool rail (Direction A)

## Overview
This bundle contains the design reference for the **in-page floating tool rail** and its four modes: idle rail, annotate toolbar, Quote+AI panel, and Guide-me panel. These surfaces appear as overlays on any web page when the user activates the FocusQuote extension from a content page.

## About the design files
The files in `design_files/` are **design references created in HTML/React** — prototypes that show the intended look and behavior. **Do not ship the HTML directly** and do not copy the JSX wholesale. Your job is to recreate these designs inside the FocusQuote extension's existing codebase, using its established framework, component patterns, build pipeline, and conventions.

## Fidelity
**High-fidelity.** Exact colors, fonts, sizes, spacing, radii, shadows, and copy are specified below. Reproduce pixel-perfectly. The only liberty: swap component implementations to match your codebase's primitives.

---

## Four surfaces to build

### 1. Tool rail (idle state) — `42 × ~200 px`
A vertical floating pill anchored to the left edge of the viewport (or wherever you prefer). Semi-transparent dark overlay behind the page content.

Four tool buttons stacked vertically:
- **Alerts** (bell icon)
- **Annotate** (pen icon) — active state shown with amber-soft background
- **Quote + AI** (quote icon)
- **Guide me** (sparkle icon)

Followed by a 1px hairline divider, then a collapse chevron button at the bottom.

### 2. Annotate mode — top toolbar
When "Annotate" is active in the rail, a horizontal toolbar appears at the top of the viewport. Contains:

1. **Mode badge** — amber-soft pill with pen icon + mono uppercase `ANNOTATE`
2. **Tool selector** — segmented 3-button control (pen / highlight / erase) in a paper-2 pill
3. **Color swatches** — 5 color dots: amber, ink, blue, sage, clay
4. **Stroke slider** — mono label `STROKE`, 96px track, current value `3.2`
5. Hairline divider
6. **Undo / Redo** ghost icon buttons
7. **Clear** ghost button (clay ink + border)
8. **Save PNG** amber button (single action)
9. Hairline divider
10. **Exit** ghost button with X icon

### 3. Quote + AI panel — `320 × ~auto`
Paper panel with rounded corners, shadow, mono kicker header. Contains:

1. **Header** — mono uppercase `QUOTE · AI` (amber) + close X button
2. **Quoted passage** — paper card with amber left rail (3px), mono meta line (source + timestamp), serif italic body
3. **AI Summary** — mono uppercase `SUMMARY` label (sage ink) with sparkle icon, followed by sans body text
4. **Suggested follow-ups** — mono uppercase label `SUGGESTED FOLLOW-UPS`, then 3 numbered buttons (01, 02, 03 badges) with the question text
5. **Footer composer** — paper-2 band with input + keyboard hint + amber `Ask` button

### 4. Guide me panel — `320 × ~auto`
Same shell as Quote+AI, different content:

1. **Header** — mono uppercase `GUIDE ME` (amber) + close X
2. **Instructional paragraph** — explaining what to do, with an inline bold example
3. **Recent** — mono uppercase label, two recent-query rows with dashed borders + arrow icons
4. **Footer composer** — input + hint + amber `Generate` button

---

## Files in this bundle

```
design_handoff_tools/
├── README.md                       ← this file (read first)
├── TOKENS.md                       ← design tokens (same as popup system)
├── COMPONENTS.md                   ← component-by-component anatomy
├── COPY.md                         ← exact strings used
└── design_files/
    ├── variant-a-tools.jsx         ← Direction A tool rail JSX (reference only)
    ├── icons.jsx                   ← stroke icon set
    └── FocusQuote Popup.html       ← full canvas (scroll to "In-page tool rail" section)
```

Open `design_files/FocusQuote Popup.html` in a browser and scroll to the "Direction A — In-page tool rail" section to see the four modes in context. Use `variant-a-tools.jsx` to read exact paddings, sizes, and color usage when this README is ambiguous.

---

## Implementation notes

- **Single amber action per surface.** Never show two amber buttons at once. The annotate toolbar's **Save PNG** is the sole amber action; everything else is ghost. The Quote+AI panel's **Ask** is its sole amber action. Guide-me's **Generate** is its sole amber action.
- **Floating overlays** — these render over arbitrary page content. Use `position: fixed` or your framework's portal/overlay primitive. The rail anchors to the left viewport edge; the annotate toolbar anchors to the top; the panels can float wherever makes sense (typically near the rail).
- **Dark backdrop** — when any of these are active, the page content behind should have a subtle dark overlay (`rgba(14,14,16,0.6)` or similar) so the floating UI reads clearly against any page background.
- **Same token system** — all colors, fonts, spacing, radii, shadows match the popup. Refer to `TOKENS.md` for the full palette.

---

## Fonts

Same as the popup system:

```html
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

- **Newsreader** (serif) — italic quote body
- **Geist** (sans) — interface body
- **JetBrains Mono** (mono) — labels, meta, kickers

---

## Next files to read
1. `TOKENS.md` — exact colors, spacing, radii, type scale.
2. `COMPONENTS.md` — anatomy per component.
3. `COPY.md` — every string used.
