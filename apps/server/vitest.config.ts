import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./test.db",
      BETTER_AUTH_SECRET: "test-secret-do-not-use-in-prod-please-x",
      BETTER_AUTH_URL: "http://localhost:3000",
      EXTENSION_ORIGIN: "chrome-extension://test",
    },
  },
})
