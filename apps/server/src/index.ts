import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { env } from "./env"

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
