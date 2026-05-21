# Copy — FocusQuote Direction A

Exact strings used in the design. Localize as appropriate; keep mono-cased labels uppercase via CSS, not by hard-coding the casing in your string files.

## Popup

| Slot | String |
|------|--------|
| Wordmark | `FocusQuote` (render with `Quote` half in amber) |
| Date | `FRI · MAY 15` (dynamic; format `EEE · MMM d`, uppercase) |
| Intent label | `Today's intent` |
| Intent body (example) | `Consolidating async architecture patterns in Node.js.` |
| Section label | `Focus session` |
| Goal input placeholder | `What are you focusing on?` |
| Duration options | `15`, `25`, `45` |
| Primary button | `Start 25-min session` (substitute selected minutes) |
| Stats line | `14 day streak`, `8 today`, `142 quotes` |
| Drawer header label | `Saved quotes` |
| Drawer header count suffix | `· 142` |
| Drawer "view all" | `All →` |
| Search placeholder | `Search quotes or tags…` |

### Sample quote-card content (for storybook / fixtures)

```json
[
  {
    "tag": "node-tar",
    "time": "2h",
    "title": "Arbitrary File Read/Write via Hardlink Target",
    "snippet": "Symlink chain in node-tar extraction allows arbitrary write outside the extraction directory.",
    "source": "GitHub Security Advisory"
  },
  {
    "tag": "flask + mongo",
    "time": "yest",
    "title": "Setting up document validation",
    "snippet": "In this Part II tutorial we'll update the basic Flask server from Part I with schema-bound writes.",
    "source": "Riken Mehta · Medium"
  },
  {
    "tag": "v8 internals",
    "time": "Tue",
    "title": "Macro-task queue ordering",
    "snippet": "The event loop drains microtasks before yielding to the next macro task — the render flush sits in between.",
    "source": "Lin Clark · Mozilla Hacks"
  }
]
```

## Settings

| Slot | String |
|------|--------|
| Header back link | `Back` |
| Page title | `Settings` |
| Section label | `Account` |
| Sign-out button | `Sign out` |
| Section label | `Appearance` |
| Appearance options | `Light`, `Dark`, `Auto` |
| Section label | `Session defaults` |
| Stepper labels | `Focus`, `Break` (unit: `min`) |
| Section label | `Translation` |
| Translation labels | `From`, `To` |
| Translation values (example) | `English`, `Spanish` |
| Section label | `Storage` |
| Storage row | `Local cache` |
| Capacity readout (example) | `4.2 / 50 MB` |

## Selection toolbar

| Slot | String |
|------|--------|
| Primary action (default) | `Save quote` |
| Primary action (saved) | `Saved` |
| Lang picker labels | `FROM`, `TO` (rendered uppercase via CSS) |
| ISO codes | `EN`, `ES`, `PT`, `FR`, `DE`, `IT`, `JA`, etc. — ISO-639 alpha-2 |
| Translate icon button | (icon-only; aria-label `Translate selection`) |
| Tag icon button | (icon-only; aria-label `Add tag`) |

### Language dropdown

| Slot | String |
|------|--------|
| Header | `Translate to` |
| Filter placeholder | `Filter…` |
| Language names | `Spanish`, `Portuguese`, `French`, `German`, `Italian`, `Japanese`, … |

## Tone

Sentence-case headings, lowercase mono labels in source (CSS uppercases them). One-line, declarative copy. Avoid exclamation marks and emoji.
