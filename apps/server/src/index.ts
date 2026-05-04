import { serve } from "@hono/node-server"
import { migrate } from "drizzle-orm/libsql/migrator"
import { env } from "./env"
import { db } from "./db/client"
import { app } from "./app"

// Apply pending migrations before accepting traffic.
try {
  await migrate(db, { migrationsFolder: "./drizzle" })
  console.log("[server] migrations applied")
} catch (err) {
  console.error("[server] migration failed:", err)
  process.exit(1)
}

serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  console.log(`[server] listening on http://localhost:${port}`)
})
