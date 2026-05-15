import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-soft": "rgb(var(--color-surface-soft) / <alpha-value>)",
        "surface-doc": "rgb(var(--color-surface-doc) / <alpha-value>)",
        hairline: "rgb(var(--color-hairline) / <alpha-value>)",
        "hairline-soft": "rgb(var(--color-hairline-soft) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        body: "rgb(var(--color-body) / <alpha-value>)",
        mute: "rgb(var(--color-mute) / <alpha-value>)",
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-pressed": "rgb(var(--color-primary-pressed) / <alpha-value>)",
        "link-blue": "rgb(var(--color-link-blue) / <alpha-value>)",
        "accent-blue": "rgb(var(--color-accent-blue) / <alpha-value>)",
        "accent-blue-soft": "rgb(var(--color-accent-blue-soft) / <alpha-value>)",
        "accent-green": "rgb(var(--color-accent-green) / <alpha-value>)",
        "accent-green-soft": "rgb(var(--color-accent-green-soft) / <alpha-value>)",
        "accent-red": "rgb(var(--color-accent-red) / <alpha-value>)",
        "accent-red-soft": "rgb(var(--color-accent-red-soft) / <alpha-value>)",
        "focus-ring": "rgb(var(--color-focus-ring) / <alpha-value>)",
        // Legacy aliases kept so older components inherit new theme tokens too.
        bg: {
          dark: "rgb(var(--legacy-bg-dark) / <alpha-value>)",
          light: "rgb(var(--legacy-bg-light) / <alpha-value>)",
        },
        card: {
          dark: "rgb(var(--legacy-card-dark) / <alpha-value>)",
          light: "rgb(var(--legacy-card-light) / <alpha-value>)",
        },
        text: {
          dark: "rgb(var(--legacy-text-dark) / <alpha-value>)",
          light: "rgb(var(--legacy-text-light) / <alpha-value>)",
        },
        accent: "rgb(var(--color-primary) / <alpha-value>)",
      },
      borderRadius: {
        DEFAULT: "6px",
      },
      fontFamily: {
        sans: [
          "\"IBM Plex Sans\"",
          "\"IBM Plex Sans Variable\"",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config
