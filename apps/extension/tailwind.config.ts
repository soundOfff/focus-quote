import type { Config } from "tailwindcss"

// Direction A token map. Three groups:
//   1. RAW tokens (paper, ink, ink-2, muted, amber, …) — primary names used
//      by surfaces migrated to Direction A. Resolve through the
//      `--<name>-rgb` channel triplets in tailwind.css.
//   2. Status tints (blue-soft, sage-ink, clay-soft, …) — soft callouts.
//   3. LEGACY aliases (canvas, surface, hairline, body, mute, primary,
//      accent-green, accent-red, …) — kept so unmigrated surfaces inherit
//      the new palette automatically. Will fade out per the Phase 5 plan.
const fqColor = (rgbVar: string) => `rgb(var(${rgbVar}) / <alpha-value>)`

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // -- Direction A raw tokens (preferred for new code) --------------
        paper: fqColor("--paper-rgb"),
        "paper-2": fqColor("--paper-2-rgb"),
        "ink-2": fqColor("--ink-2-rgb"),
        muted: fqColor("--muted-rgb"),
        "muted-2": fqColor("--muted-2-rgb"),
        rule: fqColor("--rule-rgb"),
        "rule-2": fqColor("--rule-2-rgb"),
        amber: fqColor("--amber-rgb"),
        "amber-deep": fqColor("--amber-deep-rgb"),
        "amber-soft": fqColor("--amber-soft-rgb"),
        "blue-soft": fqColor("--blue-soft-rgb"),
        "blue-ink": fqColor("--blue-ink-rgb"),
        "sage-soft": fqColor("--sage-soft-rgb"),
        "sage-ink": fqColor("--sage-ink-rgb"),
        "clay-soft": fqColor("--clay-soft-rgb"),
        "clay-ink": fqColor("--clay-ink-rgb"),
        page: fqColor("--page-rgb"),
        "popup-border": fqColor("--popup-border-rgb"),

        // -- Legacy aliases (point at new tokens via tailwind.css) --------
        canvas: fqColor("--color-canvas"),
        surface: fqColor("--color-surface"),
        "surface-soft": fqColor("--color-surface-soft"),
        "surface-doc": fqColor("--color-surface-doc"),
        hairline: fqColor("--color-hairline"),
        "hairline-soft": fqColor("--color-hairline-soft"),
        ink: fqColor("--color-ink"),
        body: fqColor("--color-body"),
        mute: fqColor("--color-mute"),
        primary: fqColor("--color-primary"),
        "primary-pressed": fqColor("--color-primary-pressed"),
        "link-blue": fqColor("--color-link-blue"),
        "accent-blue": fqColor("--color-accent-blue"),
        "accent-blue-soft": fqColor("--color-accent-blue-soft"),
        "accent-green": fqColor("--color-accent-green"),
        "accent-green-soft": fqColor("--color-accent-green-soft"),
        "accent-red": fqColor("--color-accent-red"),
        "accent-red-soft": fqColor("--color-accent-red-soft"),
        "focus-ring": fqColor("--color-focus-ring"),
        bg: {
          dark: fqColor("--legacy-bg-dark"),
          light: fqColor("--legacy-bg-light"),
        },
        card: {
          dark: fqColor("--legacy-card-dark"),
          light: fqColor("--legacy-card-light"),
        },
        text: {
          dark: fqColor("--legacy-text-dark"),
          light: fqColor("--legacy-text-light"),
        },
        accent: fqColor("--color-primary"),
      },
      borderRadius: {
        DEFAULT: "6px",
        chip: "7px",
        control: "8px",
        card: "10px",
        popup: "14px",
        pill: "9999px",
      },
      boxShadow: {
        popup: "var(--shadow-popup)",
        toolbar: "var(--shadow-toolbar)",
        "segmented-active": "var(--shadow-segmented-active)",
      },
      fontFamily: {
        // Geist (sans) is the interface body. Newsreader (serif) shows up
        // at "serif moments" (wordmark, settings heading, quote titles,
        // pull-quotes). JetBrains Mono carries every uppercase label, ID,
        // date, ISO code. Fallbacks survive a font-load failure cleanly.
        sans: [
          '"Geist Sans"',
          "Geist",
          '"IBM Plex Sans"',
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        serif: [
          "Newsreader",
          '"Iowan Old Style"',
          "Georgia",
          '"Times New Roman"',
          "serif",
        ],
        mono: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          '"Liberation Mono"',
          "monospace",
        ],
      },
      letterSpacing: {
        mono: "0.06em",
        "mono-tight": "0.04em",
        "mono-wide": "0.12em",
      },
    },
  },
  plugins: [],
} satisfies Config
