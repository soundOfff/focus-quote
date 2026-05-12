import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "#eeefe9",
        surface: "#ffffff",
        "surface-soft": "#e5e7e0",
        "surface-doc": "#fcfcfa",
        hairline: "#bfc1b7",
        "hairline-soft": "#dcdfd2",
        ink: "#23251d",
        body: "#4d4f46",
        mute: "#6c6e63",
        primary: "#f7a501",
        "primary-pressed": "#dd9001",
        "link-blue": "#1d4ed8",
        "accent-blue": "#2c84e0",
        "accent-blue-soft": "#dceaf6",
        "accent-green": "#2c8c66",
        "accent-green-soft": "#d9eddf",
        "accent-red": "#cd4239",
        "accent-red-soft": "#f7d6d3",
        "focus-ring": "rgb(59 130 246)",
        bg: { dark: "#eeefe9", light: "#eeefe9" },
        card: { dark: "#ffffff", light: "#ffffff" },
        text: { dark: "#23251d", light: "#23251d" },
        accent: "#f7a501",
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
