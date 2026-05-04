import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: { dark: "#1a1a2e", light: "#f5f5f5" },
        card: { dark: "#16213e", light: "#ffffff" },
        text: { dark: "#eaeaea", light: "#2d2d2d" },
        accent: "#e94560",
      },
      borderRadius: {
        DEFAULT: "10px",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
      fontFamily: {
        sans: [
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
