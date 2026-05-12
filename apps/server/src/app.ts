import { Hono } from "hono"
import { cors } from "hono/cors"
import { env } from "./env"
import { auth } from "./auth"
import { quotesRoutes } from "./routes/quotes"
import { focusSessionsRoutes } from "./routes/focus-sessions"
import { sessionUrlsRoutes } from "./routes/session-urls"
import { streamRoutes } from "./routes/stream"
import { syncRoutes } from "./routes/sync"
import { authBridgeRoutes } from "./routes/auth-bridge"
import { topicsRoutes } from "./routes/topics"

export const app = new Hono()

app.use(
  "*",
  cors({
    origin: [env.EXTENSION_ORIGIN, env.BETTER_AUTH_URL],
    credentials: true,
    allowHeaders: ["Authorization", "Content-Type"],
    exposeHeaders: ["set-auth-token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 600,
  }),
)

// Better Auth owns its own routes under /api/auth/*
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))

// Bridge page for chrome-extension magic-link sign-in. See route file.
app.route("/auth/magic-bridge", authBridgeRoutes)

app.route("/api/quotes", quotesRoutes)
app.route("/api/focus-sessions", focusSessionsRoutes)
app.route("/api/session-urls", sessionUrlsRoutes)
app.route("/api/topics", topicsRoutes)
app.route("/api/sync", syncRoutes)
app.route("/api/stream", streamRoutes)

app.get("/health", (c) =>
  c.json({ ok: true, service: "focus-quote", ts: new Date().toISOString() }),
)

app.get("/", (c) => c.text("FocusQuote API. See /health."))
