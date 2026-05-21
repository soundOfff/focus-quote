# Components — FocusQuote Direction A

Component-by-component anatomy. Refer to `TOKENS.md` for raw values. Where a number is not in TOKENS, it's listed inline.

---

## 1. `PopupShell`

Outer container for the popup. See `.popup-root` in TOKENS.md.

```
width: 380px
background: --paper
border: 1px solid --popup-border  (#DAD3C2)
border-radius: 14px
box-shadow: --shadow-popup
overflow: hidden
```

Internally a vertical stack of regions, each separated by `1px solid --rule`.

---

## 2. `HeaderBar`

```
padding: 14px 16px 12px
border-bottom: 1px solid --rule
display: flex; align-items: center; justify-content: space-between
```

Left cluster (`gap: 8`, baseline-aligned):
- Wordmark: `<span>Focus<span style="color: --amber-deep">Quote</span></span>` · serif · 18px · 600 · `-0.01em`
- Date tag: mono · 9.5px · `--muted-2` · uppercase letterforms via input (`FRI · MAY 15`)

Right cluster:
- Gear icon ghost button — see `.btn-ghost` below, padding `6px`, radius `7px`.

In the Settings screen, header becomes: Back-ghost-button (left) · "Settings" serif 14px 600 (center) · 38px spacer (right).

---

## 3. `IntentBand`

The Today's Intent band. Tinted to read as a recessed banner inside the popup.

```
padding: 12px 16px 6px
background: --paper-2
border-bottom: 1px solid --rule
```

- Label row: mono · 10.5px · `--blue-ink` · uppercase · target-icon prefix (11px, stroke 2). `gap: 6`. Text: `"Today's intent"`.
- Body: 13px · 500 · `--ink-2` · `line-height: 1.4` · `margin-bottom: 8`.

---

## 4. `FocusSession`

```
padding: 14px 16px 16px
```

Inside:

1. Section label `Focus session` — mono 10.5px (`.mono` token).
2. Goal input (full width):
   ```
   .input {
     background: --paper-2;
     border: 1px solid --rule-2;
     border-radius: 8px;
     padding: 9px 11px;
     font-size: 13px;
     color: --ink;
   }
   .input::placeholder { color: --muted-2 }
   ```
   Placeholder: `"What are you focusing on?"`. `margin-bottom: 10`.

3. Action row: `display: flex; gap: 8`.
   - **Duration segmented control** (`15 | 25 | 45`):
     ```
     display: flex
     border: 1px solid --rule-2
     border-radius: 8px
     overflow: hidden
     background: --paper-2
     ```
     Each button: padding `0 11px`, height matches the primary button (32–36px). Active state (25 by default): background `--paper`, weight 600, `box-shadow: --shadow-segmented-active`. Inactive: transparent, weight 500, color `--muted`. Buttons divided by `1px solid --rule`. Font: mono 12px.
   - **Primary amber button** `flex: 1`:
     ```
     .btn-amber {
       background: linear-gradient(180deg, #F4AC4F 0%, #EE9B30 100%);
       color: #2A1A05;
       border: 1px solid #C77A1F;
       border-radius: 8px;
       box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(40,30,15,0.15);
       font-weight: 600; font-size: 13px;
       padding: 10px 14px;
     }
     ```
     Label: `<Play 13px> Start 25-min session`. (Update minutes dynamically from selection.)

4. **Live stats row** — `margin-top: 12`, `font-size: 11.5`, `color: --muted`, items separated by `3 × 3 px` `--muted-2` dots.
   - Flame icon (12px, stroke 1.8, color `--amber-deep`) + `<b>14</b> day streak`
   - `<b>8</b> today`
   - `<b>142</b> quotes`

   `<b>` values: weight 600, color `--ink-2`.

---

## 5. `SavedQuotesDrawer`

```
border-top: 1px solid --rule
background: --paper-2
```

**Header** — `padding: 12px 16px 8px`, flex row, justify-between.
- Left: mono `"Saved quotes"` · `--muted-2` count `· 142`.
- Right: `"All →"` link — `--blue-ink` · 11px · 500 · `display: inline-flex; gap: 3`.

**Search** — `padding: 0 12px 4px`. Input has a 13px search icon at `left: 11px`, `padding-left: 32px`, background `--paper`, font-size 12.5px.

**Scroll area** — `max-height: 260px`, `overflow-y: auto`, `padding: 8px 12px 12px`. Custom scrollbar: 4px wide thumb in `--rule-2`, transparent track.

**Quote card** (per item):

```
background: --paper
border: 1px solid --rule
border-radius: 10px
padding: 11px 12px
margin-bottom: 7px
cursor: pointer
```

Contents:
1. Top row, justify-between, `margin-bottom: 5`:
   - Chip (`.chip`) showing the tag — mono 10.5px, padding `3px 7px`, radius 999, background `--paper-2`, border `1px solid --rule`, color `--muted`.
   - Mono timestamp `--muted-2` 9.5px (e.g. `"2h"`, `"yest"`, `"Tue"`).
2. Title: serif 13.5px · 600 · line-height 1.3 · `--ink` · `-0.005em` · `margin-bottom: 4`.
3. Snippet: 11.5px · line-height 1.45 · `--muted` · 2-line clamp:
   ```css
   display: -webkit-box;
   -webkit-line-clamp: 2;
   -webkit-box-orient: vertical;
   overflow: hidden;
   ```
4. Source line: mono 9.5px · `--muted-2` · `margin-top: 7` · prefixed with em-dash: `"— Riken Mehta · Medium"`.

---

## 6. Settings — section labels

Every section heading: `mono small-caps` (10.5px, `--muted`, `letter-spacing: 0.06em`, uppercase), `margin-bottom: 8`. Names: `Account`, `Appearance`, `Session defaults`, `Translation`, `Storage`.

## 7. Settings — Account row

```
background: --paper-2
border: 1px solid --rule
border-radius: 10px
padding: 10px
display: flex; align-items: center; gap: 10
margin-bottom: 16
```

- **Avatar**: 34×34px circle (`border-radius: 999px`), background `--amber-soft`, border `1px solid --amber`, color `--amber-deep`, weight 700, mono 12px. Initials from name (e.g. `TB`).
- **Name + email**: name 12.5px / 600 / `--ink`; email 11px / `--muted` with ellipsis overflow.
- **Sign out** ghost button on the right: `<LogOut 12px> Sign out`, 11px font.

## 8. Settings — Appearance segmented

Three segmented buttons in a row (`flex: 1` each, `gap: 6`). Active = `Light`. Inactive buttons have background `--paper-2`, border `1px solid --rule-2`, color `--ink-2`, weight 500. Active button: background `--amber-soft`, border `1px solid --amber`, color `--amber-deep`, weight 600.

Each button: icon (13px) + label, `padding: 9px 8px`, radius 8px.

## 9. Settings — Stepper card

Used by Focus / Break under "Session defaults" and as a pattern.

```
background: --paper-2
border: 1px solid --rule
border-radius: 10px
padding: 8px 10px
```

Top row: mono label (9.5px) — e.g. `Focus`. Row 2 (flex, justify-between):
- `[−]` button: 22×22px, radius 6px, border `1px solid --rule-2`, background `--paper`, icon color `--muted`.
- Value: mono 18px · 500 · `-0.02em` · followed by 10px `--muted` unit suffix (e.g. `min`).
- `[+]` button: same as `[−]`.

## 10. Settings — Translation cards

Two-up grid (`gap: 8`). Each card:

```
background: --paper-2
border: 1px solid --rule
border-radius: 10px
padding: 7px 11px
```

- Top: mono 9.5px label (`From` / `To`).
- Bottom row (flex, justify-between, baseline): value 12.5px / 500, chevron-right 11px `--muted`.

## 11. Settings — Storage card

```
background: --paper-2
border: 1px solid --rule
border-radius: 10px
padding: 10px 11px
```

Top row (flex, justify-between, baseline):
- `Local cache` — 12px / 500.
- Capacity readout — mono 10px / `--muted` — e.g. `4.2 / 50 MB`.

Progress bar:
```
height: 5px
background: --paper
border: 1px solid --rule
border-radius: 99px
overflow: hidden
```
Fill: `linear-gradient(90deg, --amber 0%, --amber-deep 100%)`, width matches percentage.

---

# Selection toolbar

A floating popover anchored to a text selection on any web page. Single horizontal row.

## 12. `SelectionToolbar` shell

```
display: inline-flex; align-items: stretch
background: --paper
border: 1px solid --popup-border
border-radius: 10px
padding: 4px
gap: 4px
box-shadow: --shadow-toolbar
```

Anchored above or below the selection, with a 12×12px paper rotated-45° caret pointing toward the highlighted text (`border-top` and `border-left` of the caret square match `--popup-border`; the opposite two borders are transparent).

## 13. `SaveQuoteButton` (the single amber action)

```
border-radius: 7px
padding: 7px 11px 7px 9px
font-size: 12.5; font-weight: 600
display: inline-flex; align-items: center; gap: 6
letter-spacing: -0.005em
white-space: nowrap     /* required */
```

**Default state** (amber):
```
background: linear-gradient(180deg, #F4AC4F 0%, #EE9B30 100%)
color: #2A1A05
border: 1px solid #C77A1F
box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(40,30,15,0.15)
```
Icon: Bookmark 13px stroke 1.8. Label: `Save quote`.

**Saved state** (sage-soft):
```
background: --sage-soft     (#E1EBDF)
color: --sage-ink           (#4A6A47)
border: 1px solid #C6D7C2
box-shadow: none
```
Icon: Check 13px stroke 2.2. Label: `Saved`.

## 14. Hairline divider (inside the toolbar)

```
width: 1px
background: --rule
margin: 3px 1px
```

Place between the save button and the translate group, and again between the language pair and the trailing icon buttons.

## 15. `LangPicker` chip

```
background: --paper-2
border: 1px solid --rule
border-radius: 7px
padding: 5px 7px 5px 8px
display: inline-flex; align-items: center; gap: 7
color: --ink; font-size: 12; font-weight: 500
line-height: 1.1
white-space: nowrap
```

Inside (left → right):
1. **Stacked label + value** — `display: inline-flex; flex-direction: column; gap: 1`.
   - Top: mono 8.5px · `--muted` · uppercase · `letter-spacing: 0.12em` · text `FROM` or `TO`.
   - Bottom: 12px / 500 / `--ink` · language name (e.g. `English`).
2. **ISO badge** — mono 9px / 600 / `--muted`, background `--paper`, border `1px solid --rule`, radius 4px, padding `1px 4px`, `letter-spacing: 0.06em`. Codes: `EN`, `ES`, `PT`, `FR`, `DE`, `IT`, `JA`, …
3. Chevron-down (10px, color `--muted-2`). Implemented as chevron-right rotated 90°.

## 16. Arrow cap (between the two LangPickers)

```
width: 18px; height: 24px
display: inline-flex; align-items: center; justify-content: center
color: --muted-2
```

Right-arrow glyph 11px stroke 1.6. **Passive** — not a button, no hover affordance.

## 17. Trailing icon buttons

- **Globe (translate selection)**:
  ```
  background: --paper-2
  border: 1px solid --rule
  border-radius: 7px
  padding: 0 9px
  display: inline-flex; align-items: center; gap: 5
  color: --ink-2; font-size: 11.5; font-weight: 500
  ```
  Icon: Globe 13px stroke 1.7, `--muted` color.

- **Tag (overflow)** — fully ghost:
  ```
  background: transparent
  border: none
  border-radius: 7px
  padding: 0 8px
  color: --muted
  ```
  Icon: Tag 13px stroke 1.7. Use as the overflow / more-options affordance.

## 18. Language menu (dropdown)

Floats below the To chip, 6px offset.

```
width: 188px
background: --paper
border: 1px solid --popup-border
border-radius: 10px
padding: 6px
box-shadow: --shadow-toolbar
```

- **Header** — mono 9.5px · `--muted` · uppercase · padding `4px 8px 6px` · text `Translate to`.
- **Search** — 12px search icon at `left: 12px`, input has background `--paper-2`, border `1px solid --rule`, radius 6, padding `6px 8px 6px 28px`, font-size 11.5. Placeholder: `Filter…`.
- **Language rows**:
  ```
  width: 100%
  display: flex; align-items: center; justify-content: space-between
  padding: 6px 10px
  border-radius: 6px
  ```
  - Active row: background `--amber-soft`, weight 600. Check 11px stroke 2.2 in `--amber-deep` precedes the name.
  - Inactive row: transparent background, weight 500. A 11px spacer keeps alignment with the check column.
  - ISO badge on the right (same as the chip's badge).

---

## Generic primitives

### `.btn-ghost`
```
background: --paper
border: 1px solid --rule-2
color: --ink-2
border-radius: 8px
font-weight: 500; font-size: 12
padding: 8px 10px
display: inline-flex; align-items: center; gap: 6
```
Hover: background `--paper-2`.

A destructive variant uses `color: --clay-ink` and `border-color: #E8C7B7`.

### `.chip`
```
display: inline-flex; align-items: center; gap: 5
font-size: 10.5px
font-family: --font-mono
text-transform: uppercase; letter-spacing: 0.04em
color: --muted
background: --paper-2
border: 1px solid --rule
padding: 3px 7px
border-radius: 999px
```

### Mono helper
```css
.mono {
  font-family: var(--font-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--muted);
}
```
