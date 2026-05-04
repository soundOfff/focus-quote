import { defineConfig, loadEnv } from "vite"
import preact from "@preact/preset-vite"
import { crx } from "@crxjs/vite-plugin"
import path from "node:path"
import manifest from "./manifest.config"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  return {
    plugins: [preact(), crx({ manifest })],
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
    define: {
      __TURSO_DB_URL__: JSON.stringify(env.TURSO_DB_URL ?? ""),
      __TURSO_AUTH_TOKEN__: JSON.stringify(env.TURSO_AUTH_TOKEN ?? ""),
    },
    build: {
      target: "esnext",
      sourcemap: mode !== "production",
      rollupOptions: {
        input: {
          newtab: path.resolve(__dirname, "src/newtab/index.html"),
          options: path.resolve(__dirname, "src/options/index.html"),
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: { port: 5174 },
    },
  }
})
