import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { migrate } from "drizzle-orm/libsql/migrator"
import { env } from "./env"
import { db } from "./db/client"

// Apply pending migrations before accepting traffic.
try {
  await migrate(db, { migrationsFolder: "./drizzle" })
  console.log("[server] migrations applied")
} catch (err) {
  console.error("[server] migration failed:", err)
  process.exit(1)
}

const app = new Hono()

app.use(
  "*",
  cors({
    origin: [env.EXTENSION_ORIGIN],
    credentials: true,
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 600,
  }),
)

app.get("/health", (c) =>
  c.json({ ok: true, service: "focus-quote", ts: new Date().toISOString() }),
)

app.get("/", (c) => c.text("FocusQuote API. See /health."))

serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  console.log(`[server] listening on http://localhost:${port}`)
})
