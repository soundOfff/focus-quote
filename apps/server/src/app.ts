import { Hono } from "hono"
import { cors } from "hono/cors"
import { env } from "./env"
import { auth } from "./auth"
import { quotesRoutes } from "./routes/quotes"
import { focusSessionsRoutes } from "./routes/focus-sessions"
import { syncRoutes } from "./routes/sync"

export const app = new Hono()

app.use(
  "*",
  cors({
    origin: [env.EXTENSION_ORIGIN, env.BETTER_AUTH_URL],
    credentials: true,
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 600,
  }),
)

// Better Auth owns its own routes under /api/auth/*
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))

app.route("/api/quotes", quotesRoutes)
app.route("/api/focus-sessions", focusSessionsRoutes)
app.route("/api/sync", syncRoutes)

app.get("/health", (c) =>
  c.json({ ok: true, service: "focus-quote", ts: new Date().toISOString() }),
)

app.get("/", (c) => c.text("FocusQuote API. See /health."))
