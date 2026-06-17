import { Hono } from "hono"
import { cors } from "hono/cors"
import { bodyLimit } from "hono/body-limit"
import { env } from "./env"
import { auth } from "./auth"
import { quotesRoutes } from "./routes/quotes"
import { focusSessionsRoutes } from "./routes/focus-sessions"
import { sessionUrlsRoutes } from "./routes/session-urls"
import { streamRoutes } from "./routes/stream"
import { syncRoutes } from "./routes/sync"
import { authBridgeRoutes, oauthBridgeRoutes } from "./routes/auth-bridge"
import { topicsRoutes } from "./routes/topics"
import { vaultRoutes } from "./routes/vault"
import { tagsRoutes } from "./routes/tags"
import { aiToolbarRoutes } from "./routes/ai-toolbar"
import { sessionActionsRoutes } from "./routes/session-actions"
import { mediaRoutes } from "./routes/media"
import { settingsRoutes } from "./routes/settings"
import { profileRoutes } from "./routes/profile"
import { privacyRoutes } from "./routes/privacy"
import { secretsRoutes } from "./routes/secrets"
import { aiHistoryRoutes } from "./routes/ai-history"
import { recallRoutes } from "./routes/recall"
import { toolbarStateRoutes } from "./routes/toolbar-state"

export const app = new Hono()

// Hard backstop on request body size. The largest legitimate payload is a media
// upload (~13.4 MB of base64 for a 10 MB file) plus JSON overhead; 16 MB leaves
// headroom for that and sync batches while rejecting abusive blobs before they
// reach a handler. Per-route validation still enforces tighter, typed limits.
app.use(
  "*",
  bodyLimit({
    maxSize: 16 * 1024 * 1024,
    onError: (c) =>
      c.json({ error: "Payload too large", code: "PAYLOAD_TOO_LARGE" }, 413),
  }),
)

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

// Bridge page for chrome-extension Google (OAuth) sign-in. See route file.
app.route("/auth/oauth-bridge", oauthBridgeRoutes)

app.route("/api/quotes", quotesRoutes)
app.route("/api/focus-sessions", focusSessionsRoutes)
app.route("/api/session-urls", sessionUrlsRoutes)
app.route("/api/session-actions", sessionActionsRoutes)
app.route("/api/media", mediaRoutes)
app.route("/api/topics", topicsRoutes)
app.route("/api/vault", vaultRoutes)
app.route("/api/tags", tagsRoutes)
app.route("/api/ai", aiToolbarRoutes)
app.route("/api/ai-history", aiHistoryRoutes)
app.route("/api/sync", syncRoutes)
app.route("/api/stream", streamRoutes)
app.route("/api/settings", settingsRoutes)
app.route("/api/profile", profileRoutes)
app.route("/api/privacy", privacyRoutes)
app.route("/api/secrets", secretsRoutes)
app.route("/api/recall", recallRoutes)
app.route("/api/toolbar-state", toolbarStateRoutes)

app.get("/health", (c) =>
  c.json({ ok: true, service: "focus-quote", ts: new Date().toISOString() }),
)

app.get("/", (c) => c.text("FocusQuote API. See /health."))
