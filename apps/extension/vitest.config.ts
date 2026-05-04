import { defineConfig } from "vitest/config"
import preact from "@preact/preset-vite"
import path from "node:path"

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  define: {
    __TURSO_DB_URL__: JSON.stringify("test://"),
    __TURSO_AUTH_TOKEN__: JSON.stringify("test-token"),
  },
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
  },
})
