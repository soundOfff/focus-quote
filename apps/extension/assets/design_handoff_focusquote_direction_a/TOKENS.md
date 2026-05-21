# Design tokens — FocusQuote Direction A

Drop these into a CSS file at the root of the extension's UI, or translate them to your token system (Tailwind config, Style Dictionary, etc.). Names are stable; only values are authoritative.

## Colors

```css
:root {
  /* Paper surfaces */
  --paper:        #FBFAF6;  /* primary background */
  --paper-2:      #F4F2EC;  /* recessed / banded sections */

  /* Ink */
  --ink:          #1A1814;  /* body + headings */
  --ink-2:        #3A362F;  /* secondary text, dense paragraphs */
  --muted:        #807A6F;  /* mono labels, meta */
  --muted-2:      #B5AEA0;  /* placeholders, dividers’ companion */

  /* Hairlines */
  --rule:         #E5E0D5;  /* primary 1px divider */
  --rule-2:       #D9D3C5;  /* slightly heavier; inputs, segmented borders */

  /* Brand amber — used once per surface */
  --amber:        #F2A03C;
  --amber-deep:   #C77A1F;
  --amber-soft:   #FBE6C8;

  /* Status tints (used as soft callouts only) */
  --blue-soft:    #E0EBF1;
  --blue-ink:     #2E5C73;
  --sage-soft:    #E1EBDF;
  --sage-ink:     #4A6A47;
  --clay-soft:    #F2DDD3;
  --clay-ink:     #A04B26;

  /* Page-level (extension chrome / outside the popup) */
  --page:         #E9E7E1;
  --popup-border: #DAD3C2;
}
```

## Type

```css
:root {
  --font-serif:  'Newsreader', 'Iowan Old Style', Georgia, serif;
  --font-sans:   'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono:   'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}
```

Type scale (Direction A, 380px popup):

| Role                | Family | Size  | Weight | Tracking  | Notes |
|---------------------|--------|-------|--------|-----------|-------|
| Wordmark / settings heading | serif | 18 / 14 | 600 | -0.01em | "FocusQuote" / "Settings" |
| Section label (mono)| mono   | 10.5  | 500    | 0.06em UPPER | section dividers, meta |
| Tiny mono           | mono   | 9.5   | 500    | 0.04em UPPER | dates, ids, badges |
| Body                | sans   | 12.5–13 | 400/500 | -0.005em | most text |
| Body small / meta   | sans   | 11–11.5 | 400/500 | 0 | timestamps, helper text |
| Quote title         | serif  | 13.5  | 600    | -0.005em | inside saved-quote cards |
| Quote snippet       | sans   | 11.5  | 400    | 0 | 2-line clamp |
| Stat numeric        | mono   | 18    | 500    | -0.005em | session-defaults steppers |
| Primary button      | sans   | 13    | 600    | 0 | "Start 25-min session" |
| Ghost button        | sans   | 12    | 500    | 0 | "Sign out" etc |

## Spacing

The popup is built on **4px** increments. Common values: 4, 6, 8, 10, 12, 14, 16.

| Token | Value | Used for |
|-------|-------|----------|
| `--pad-section-x` | 16px | left/right padding inside each popup region |
| `--pad-section-y` | 12–14px | top/bottom padding per region |
| `--gap-stack`     | 8px  | between stacked input / button rows |
| `--gap-row`       | 6–7px | between sibling quote cards |
| `--card-pad`      | 10–11px | inside quote cards / stat cards |

## Radii

| Token | Value | Used for |
|-------|-------|----------|
| `--radius-popup`   | 14px | popup outer corner (also web app modal port) |
| `--radius-card`    | 10px | quote cards, stat cards, callout boxes |
| `--radius-control` | 8px  | buttons, inputs, segmented controls |
| `--radius-chip`    | 6–7px | language chips, ISO badges |
| `--radius-pill`    | 999px | avatar circle, status chips |

## Shadows

```css
/* Outer popup */
--shadow-popup:
  0 1px 0 rgba(255,255,255,0.7) inset,
  0 12px 28px -12px rgba(40,30,15,0.18),
  0 2px 6px -2px rgba(40,30,15,0.10);

/* Floating selection toolbar (heavier — sits over web content) */
--shadow-toolbar:
  0 1px 0 rgba(255,255,255,0.7) inset,
  0 14px 32px -10px rgba(40,30,15,0.22),
  0 3px 8px -2px rgba(40,30,15,0.10);

/* Active segmented button (raised paper card) */
--shadow-segmented-active: 0 1px 2px rgba(40,30,15,0.08);
```

## Borders & strokes

- Hairline rule: `1px solid var(--rule)`
- Heavier hairline (inputs, segmented border): `1px solid var(--rule-2)`
- Popup outer border: `1px solid var(--popup-border)` (#DAD3C2)
- Icon stroke-width: `1.6` default, `1.8–2` for filled chips / small glyphs, `2.2` for the saved checkmark.

## Focus ring

```css
input:focus, button:focus-visible {
  outline: none;
  border-color: var(--amber-deep);
  box-shadow: 0 0 0 3px rgba(242, 160, 60, 0.15);
}
```

## Layout — the popup container

```css
.popup-root {
  font-family: var(--font-sans);
  color: var(--ink);
  background: var(--paper);
  width: 380px;
  border-radius: var(--radius-popup);
  overflow: hidden;
  box-shadow: var(--shadow-popup);
  border: 1px solid var(--popup-border);
}
```
