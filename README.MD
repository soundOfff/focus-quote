# FocusQuote

A Chrome extension + backend that helps you capture quotes from the web, run focus sessions, and (new) get AI-powered insights about how you spend a session — which URLs were on-goal vs. distractions.

## Architecture

Monorepo with npm workspaces:

```
apps/
  extension/   Chrome MV3 extension (Preact + Tailwind + Effect)
  server/      Hono + Drizzle + libSQL/Turso, Better Auth, Anthropic SDK
packages/
  shared/      Effect Schema types + API contracts (imported by both)
```

- **Extension** — popup (timer + quotes), new tab (greeting + daily goal), options page, background service worker, content script. State managed via Effect services on top of `chrome.storage.local`.
- **Server** — REST API at `/api/*`, authenticated with Better Auth bearer tokens. SQLite locally (`data.db`); Turso in production.
- **Shared** — Effect `Schema` types and request/response contracts, so the wire format is the same on both sides.

## Prerequisites

- Node.js 20+
- npm 10+

## First-time setup

```bash
# From the repo root
npm install

# Copy the example env file and fill in the secrets
cp apps/server/.env.example apps/server/.env
# (open apps/server/.env and set BETTER_AUTH_SECRET — see below)

# Initialize the local SQLite DB
npm run dev:server   # auto-applies migrations on first start, then Ctrl+C
```

### Required env vars (`apps/server/.env`)

| Variable | Required | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | `http://localhost:3000` for dev |
| `EXTENSION_ORIGIN` | yes | `chrome-extension://<your-extension-id>` (visible in `chrome://extensions`) |
| `DATABASE_URL` | no | defaults to `file:./data.db` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | enables Google sign-in |
| `RESEND_API_KEY` | no | enables magic-link emails (otherwise links log to stdout) |
| `ANTHROPIC_API_KEY` | no | enables AI URL classification + session summaries |

## Running locally

```bash
# Terminal 1 — backend on http://localhost:3000
npm run dev:server

# Terminal 2 — extension dev build with HMR
npm run dev:extension
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `apps/extension/dist`
4. Copy the extension ID and put it into `apps/server/.env` as `EXTENSION_ORIGIN=chrome-extension://<id>`, then restart the server

## Common commands

```bash
# Health check
curl http://localhost:3000/health

# Typecheck everything
npm run typecheck

# Run tests (workspace-aware)
npm run test

# Production build of the extension
npm run build:extension

# Drizzle: generate a new migration after schema changes
cd apps/server && npm run db:generate

# Drizzle: apply pending migrations manually
cd apps/server && npm run db:migrate
```

## Project structure

```
apps/extension/src/
  background/service-worker.ts   alarms, runtime messages, webNavigation, sync drain
  content/content.ts             "save quote" floating button, text-selection capture
  popup/                         action popup (timer, quotes, sign-in)
  newtab/                        new-tab page (greeting, daily goal, stats)
  options/                       settings page (theme, API keys, privacy, blocklist)
  services/                      Effect services: api, sessions, quotes, sync, auth, urlTracker, realtimeStream
  shared/                        chrome.storage shapes, message types, prefs, privacy

apps/server/src/
  app.ts                         Hono app, CORS, route mounting
  auth.ts                        Better Auth (magic-link + Google + bearer)
  db/schema.ts                   Drizzle schema (users, sessions, quotes, focus_sessions, session_urls)
  lib/                           llm.ts (Anthropic), rate-limit.ts, session-bus.ts (SSE pub-sub), api-schemas.ts (zod)
  middleware/require-user.ts     bearer auth guard
  routes/                        quotes, focus-sessions, session-urls, stream (SSE), sync (batch)
```

## Features

- **Quotes** — save text from any page via context menu or in-page floating button; tag, search, export
- **Focus sessions** — start a timed session with a goal; badge counts down; notification on completion
- **Sign-in** — magic-link email or Google OAuth (Better Auth)
- **Offline-first sync** — local writes queued, drained to the server periodically
- **AI session analysis** *(opt-in)* — when enabled, URLs visited during a session are classified by AI (Anthropic Haiku); distractions surface as nudges in real time via SSE

See `/Users/User/.claude/plans/1-panel-de-snappy-token.md` for the roadmap beyond Phase 1 (stats dashboard, deep-focus mode, AI quote suggestions, social features).

## Troubleshooting

**"Backend did not return a bearer token"** during sign-in — restart the server after changing CORS settings, then request a new magic link (old ones are single-use and expire after 5 min).

**Extension can't reach the server** — confirm `EXTENSION_ORIGIN` in `apps/server/.env` matches your extension ID exactly (visible in `chrome://extensions`).

**Migrations need to re-run** — `cd apps/server && npm run db:migrate`. Migrations also run automatically on `npm run dev:server`.

**Need to restart everything from scratch:**

```bash
# Stop both terminals with Ctrl+C, then:
npm run dev:server     # terminal 1
npm run dev:extension  # terminal 2
```
