# Components — FocusQuote tool rail (Direction A)

Component-by-component anatomy. Refer to `TOKENS.md` for raw values.

---

## 1. `ToolRail` (idle state)

Vertical floating pill anchored to the left viewport edge.

```
width: 42px
background: --paper  (#FBFAF6)
border: 1px solid --popup-border  (#DAD3C2)
border-radius: 11px
box-shadow:
  0 1px 0 rgba(255,255,255,0.7) inset,
  0 14px 30px -10px rgba(40,30,15,0.22),
  0 3px 8px -2px rgba(40,30,15,0.10)
padding: 5px 4px
display: flex; flex-direction: column; gap: 2px
```

### Tool buttons (4 icons)

Each button:
```
width: 34px; height: 32px
display: grid; place-items: center
border-radius: 7px
cursor: pointer
```

**Inactive state:**
```
background: transparent
color: --ink-2  (#3A362F)
border: 1px solid transparent
```

**Active state:**
```
background: --amber-soft  (#FBE6C8)
color: --amber-deep  (#C77A1F)
border: 1px solid #ECCE9E
```

Icons: 15px, stroke 1.8. In order:
1. Bell (IBell) — Alerts
2. Pen (IPen) — Annotate
3. Quote glyph (IQuote) — Quote + AI
4. Sparkle (ISparkle) — Guide me

### Divider

```
height: 1px
background: --rule  (#E5E0D5)
margin: 5px 5px
```

### Collapse button

Same dimensions and states as tool buttons. Icon: chevron-right 13px stroke 1.8.

---

## 2. `AnnotateToolbar` (horizontal top bar)

Floats at the top of the viewport when Annotate mode is active.

```
display: inline-flex; align-items: stretch
background: --paper
border: 1px solid --popup-border
border-radius: 10px
padding: 5px
gap: 4px
box-shadow:
  0 1px 0 rgba(255,255,255,0.7) inset,
  0 14px 30px -10px rgba(40,30,15,0.22),
  0 3px 8px -2px rgba(40,30,15,0.10)
```

### Mode badge

```
display: inline-flex; align-items: center; gap: 7px
padding: 5px 10px 5px 9px
background: --amber-soft
border: 1px solid #ECCE9E
border-radius: 7px
```

- Icon: pen 13px stroke 1.9, color `--amber-deep`
- Label: mono 10px / 600 / uppercase / `--amber-deep` / `letter-spacing: 0.12em` — text `ANNOTATE`

### Tool selector (segmented)

Outer shell:
```
display: inline-flex; align-items: center
background: --paper-2
border: 1px solid --rule
border-radius: 7px
padding: 2px
gap: 2px
```

Each button:
```
width: 26px; height: 24px
display: grid; place-items: center
border-radius: 5px
cursor: pointer
```

**Inactive:** transparent background, color `--muted`, border transparent.

**Active:**
```
background: --paper
border: 1px solid --popup-border
color: --ink
box-shadow: 0 1px 2px rgba(40,30,15,0.08)
```

Icons: 12px stroke 1.8. Order: pen (IPen), bolt (IBolt for highlight), X (IX for erase).

### Color swatches

Container: `display: inline-flex; gap: 4px; padding: 0 4px`.

Each swatch button:
```
width: 16px; height: 16px
border-radius: 999px
background: <color>
cursor: pointer
padding: 0
```

**Inactive:**
```
border: 2px solid transparent
outline: 1px solid --rule
outline-offset: 0
```

**Active:**
```
border: 2px solid --paper
outline: 1px solid <color>  (same as background)
outline-offset: 0
```

Colors in order:
1. `#C77A1F` (amber-deep) — active by default
2. `#1A1814` (ink)
3. `#2E5C73` (blue-ink)
4. `#4A6A47` (sage-ink)
5. `#A04B26` (clay-ink)

### Stroke slider

Container: `display: inline-flex; align-items: center; gap: 8px; padding: 0 10px 0 4px`.

- **Label**: mono 9.5px / uppercase / `--muted` / `letter-spacing: 0.12em` — text `STROKE`
- **Slider**: relative container 96px wide × 18px tall:
  - Track: absolute, inset `8px 0`, height 2px, background `--rule`, radius 99px
  - Fill: absolute, left 0, top 8px, height 2px, width 55%, background `--amber-deep`, radius 99px
  - Thumb: absolute, left `calc(55% - 7px)`, top 2px, 14×14px circle, background `--paper`, border `1px solid --amber-deep`, shadow `0 1px 2px rgba(40,30,15,0.15)`
- **Value**: mono 11px / 500 / `--ink-2` / min-width 22px / right-aligned — text `3.2`

### Divider

```
width: 1px
background: --rule
margin: 4px 1px
```

Place after the stroke slider and again after the Clear button.

### Undo / Redo buttons

```
width: 28px; height: 28px
display: grid; place-items: center
background: transparent
border: 1px solid transparent
border-radius: 6px
color: --ink-2
cursor: pointer
```

Icons: undo 13px stroke 1.7. Redo is the undo icon flipped horizontally (`transform: scaleX(-1)`).

### Clear button (ghost destructive)

```
background: --paper-2
border: 1px solid #E8C7B7
color: --clay-ink  (#A04B26)
border-radius: 7px
padding: 6px 10px
font-size: 12px; font-weight: 500
display: inline-flex; align-items: center; gap: 5px
cursor: pointer
white-space: nowrap
```

Icon: trash 12px stroke 1.7. Label: `Clear`.

### Save PNG button (amber primary)

```
background: linear-gradient(180deg, #F4AC4F 0%, #EE9B30 100%)
color: #2A1A05
border: 1px solid #C77A1F
border-radius: 7px
padding: 6px 11px
font-size: 12px; font-weight: 600
box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(40,30,15,0.15)
display: inline-flex; align-items: center; gap: 6px
cursor: pointer
white-space: nowrap
letter-spacing: -0.005em
```

Icon: download 12px stroke 2. Label: `Save PNG`.

### Exit button (ghost)

```
background: --paper-2
border: 1px solid --rule
color: --ink-2
border-radius: 7px
padding: 6px 9px
font-size: 12px; font-weight: 500
display: inline-flex; align-items: center; gap: 5px
cursor: pointer
white-space: nowrap
```

Icon: X 12px stroke 2. Label: `Exit`.

---

## 3. `QuoteAIPanel` (floating paper panel)

```
width: 320px
background: --paper
border: 1px solid --popup-border
border-radius: 12px
box-shadow:
  0 1px 0 rgba(255,255,255,0.7) inset,
  0 18px 36px -12px rgba(40,30,15,0.22),
  0 3px 10px -2px rgba(40,30,15,0.10)
overflow: hidden
```

### Header

```
display: flex; align-items: center; justify-content: space-between
padding: 10px 12px 10px 14px
border-bottom: 1px solid --rule
background: --paper-2
```

Left cluster:
- 5×5px amber dot (`--amber`, radius 999)
- Mono kicker: 10px / 600 / uppercase / `--amber-deep` / `letter-spacing: 0.12em` — text `QUOTE · AI`
- Gap: 6px

Right: close button 22×22px, transparent, X icon 12px stroke 2, `--muted`.

### Quoted passage card

Container: `padding: 12px 14px 4px`.

Inner card:
```
background: --paper
border: 1px solid --rule
border-radius: 9px
padding: 10px 12px 10px 14px
position: relative
```

Left rail (absolute):
```
position: absolute; left: 0; top: 8px; bottom: 8px
width: 3px
background: --amber
border-radius: 99px
```

Meta line:
```
font-family: --font-mono
font-size: 9px
letter-spacing: 0.12em
text-transform: uppercase
color: --muted
margin-bottom: 5px
```
Text: `From x.com · 17:42` (dynamic source + timestamp).

Quote body:
```
font-family: --font-serif
font-style: italic
font-size: 13px
line-height: 1.45
color: --ink
letter-spacing: -0.005em
```

### AI Summary section

Container: `padding: 10px 14px 4px`.

Label row:
```
font-family: --font-mono
font-size: 9.5px
letter-spacing: 0.12em
text-transform: uppercase
color: --sage-ink  (#4A6A47)
display: flex; align-items: center; gap: 5px
margin-bottom: 6px
```
Icon: sparkle 11px stroke 2. Text: `SUMMARY`.

Body paragraph:
```
font-size: 12.5px
line-height: 1.55
color: --ink-2
margin: 0
```

### Suggested follow-ups

Same container padding as summary.

Label:
```
font-family: --font-mono
font-size: 9.5px
letter-spacing: 0.12em
text-transform: uppercase
color: --muted
margin-top: 12px
margin-bottom: 4px
```
Text: `SUGGESTED FOLLOW-UPS`.

List: `ul` with no bullets, no padding, `margin: 0`, `display: grid; gap: 4px`.

Each follow-up button:
```
width: 100%
text-align: left
background: --paper-2
border: 1px solid --rule
border-radius: 7px
padding: 7px 9px
font-size: 12px
font-weight: 500
color: --ink
cursor: pointer
display: flex; align-items: center; gap: 7px
line-height: 1.3
```

Badge (left):
```
font-family: --font-mono
font-size: 9px
color: --amber-deep
font-weight: 600
letter-spacing: 0.06em
border: 1px solid #E8C7B7
border-radius: 4px
padding: 1px 4px
flex-shrink: 0
```
Text: `01`, `02`, `03` (zero-padded).

### Footer composer

```
padding: 10px 12px 12px
border-top: 1px solid --rule
background: --paper-2
margin-top: 12px
```

Inner shell:
```
background: --paper
border: 1px solid --rule
border-radius: 9px
padding: 8px 8px 8px 11px
display: flex; align-items: center; gap: 8px
```

- **Input**: flex 1, transparent, no border, font-size 12.5px, color `--ink`. Placeholder: `Ask a follow-up — or leave blank to star ★`.
- **Hint**: mono 9px / `--muted-2` / `letter-spacing: 0.04em` — text `⌘ ↵`.
- **Button** (amber):
  ```
  background: linear-gradient(180deg, #F4AC4F 0%, #EE9B30 100%)
  color: #2A1A05
  border: 1px solid #C77A1F
  border-radius: 7px
  padding: 6px 11px
  font-size: 12px; font-weight: 600
  box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(40,30,15,0.15)
  letter-spacing: -0.005em
  white-space: nowrap
  ```
  Label: `Ask`.

---

## 4. `GuidePanel`

Same shell as QuoteAIPanel. Header has kicker `GUIDE ME` instead of `QUOTE · AI`.

### Body content

Container: `padding: 12px 14px 4px`.

Instructional paragraph:
```
font-size: 12.5px
line-height: 1.55
color: --ink-2
margin: 0
```

Inline bold example:
```
color: --ink
font-weight: 600
```

### Recent section

Same container padding.

Label:
```
font-family: --font-mono
font-size: 9.5px
letter-spacing: 0.12em
text-transform: uppercase
color: --muted
margin-top: 14px
margin-bottom: 5px
```
Text: `RECENT`.

List: `display: grid; gap: 4px`.

Each recent-query button:
```
width: 100%
text-align: left
background: transparent
border: 1px dashed --rule-2
border-radius: 7px
padding: 6px 9px
font-size: 12px
color: --ink-2
cursor: pointer
display: flex; align-items: center; gap: 7px
```

Icon: arrow-right 10px stroke 1.8, color `--muted-2`.

### Footer composer

Same structure as QuoteAIPanel's composer. Placeholder: `How do I…`. Button label: `Generate`. Hint: `↵`.

---

## Generic primitives

### `.rail-btn` (tool rail button)
Active / inactive states described in section 1.

### `.ghost-btn` (annotate toolbar)
```
background: --paper-2
border: 1px solid --rule
color: --ink-2
border-radius: 7px
padding: 6px 10px
font-size: 12px; font-weight: 500
display: inline-flex; align-items: center; gap: 5px
cursor: pointer
white-space: nowrap
```

### `.amber-btn`
Same as primary button in popup system. See TOKENS.md or section 3 / 4 composer.

### Panel header structure
Reused across Quote+AI and Guide-me. See section 3.
