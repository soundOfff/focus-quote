# Deployment

How to ship FocusQuote to production: the **server** (Hono API + Turso) and the
**extension** (Chrome Web Store). Staging follows the same steps with the
`*:staging` script variants and a separate database/secret set.

> **Runtime reality check.** The server is a **long-running Node process**
> (`@hono/node-server`) started with `tsx`, and it uses `node:crypto`,
> `process.exit`, and `process.env`. It is **not** a Cloudflare Workers build
> today — deploy it to a Node host (Fly.io, Render, Railway, a container, or a
> VM). Moving to Workers would require swapping `node:crypto`, the libSQL client
> bootstrap, and the `serve()` entry for a Workers-compatible build; treat that
> as separate work.

---

## Release checklist

- [ ] Provision the production Turso database and auth token
- [ ] Generate `BETTER_AUTH_SECRET` and `SECRETS_ENCRYPTION_KEY` (distinct from staging)
- [ ] Set all required env vars on the host (see [reference](#environment-variables))
- [ ] `npm run db:migrate` against the production database (schema + backfills)
- [ ] Deploy and start the server (`npm run start`); confirm `/health` returns `{ ok: true }`
- [ ] `npm run build:production` for the extension; zip `apps/extension/dist`
- [ ] Upload the zip to the Chrome Web Store; note the published extension ID
- [ ] Set `EXTENSION_ORIGIN=chrome-extension://<published-id>` and restart the server
- [ ] Smoke-test sign-in (magic link + Google) and quote capture against production

---

## Server

### 1. Database (Turso)

```bash
turso db create focusquote-prod
turso db show focusquote-prod --url           # -> DATABASE_URL (libsql://...)
turso db tokens create focusquote-prod        # -> DATABASE_AUTH_TOKEN
```

Set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` from the output. (Locally these are
unset and the server falls back to `file:./data.db`.)

### 2. Secrets

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # SECRETS_ENCRYPTION_KEY  (must be 32 raw bytes)
```

`SECRETS_ENCRYPTION_KEY` is **required in production** — it encrypts
user-provided secrets (e.g. their own API keys) at rest in the `user_secrets`
table. When it is unset the secrets endpoints reject writes. Use a value
distinct from staging so the two environments can be rotated independently.

### 3. Migrations

```bash
cd apps/server && npm run db:migrate
```

Two layers run here:

- **Schema migrations** (`./drizzle`) — these *also* run automatically on boot
  in `src/index.ts` before the server accepts traffic, so a deploy can't serve
  on a stale schema.
- **Data backfills** (`src/db/migrate.ts`, only via the `db:migrate` script) —
  backfills `quotes.content_hash`, collapses duplicate quotes so the unique
  index holds, and backfills topics. A fresh database has nothing to backfill;
  run it explicitly when **upgrading an existing** production database.

### 4. Build & run

There is no separate compile step — `tsx` runs the TypeScript directly:

```bash
npm run start            # production: tsx --env-file-if-exists=.env src/index.ts
npm run start:staging    # staging: loads .env.staging
```

The process listens on `PORT` (default `3000`). Put it behind your platform's
TLS/proxy and point `BETTER_AUTH_URL` at the public HTTPS origin.

### 5. Verify

```bash
curl https://<your-api-host>/health   # -> {"ok":true,"service":"focus-quote",...}
```

---

## Environment variables

Source of truth: `apps/server/src/env.ts` (validated with Zod on boot; the
process exits if a required var is missing or malformed).

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | Set to `production` in prod. |
| `PORT` | no | `3000` | Listen port. |
| `DATABASE_URL` | no | `file:./data.db` | Turso `libsql://…` URL in prod. |
| `DATABASE_AUTH_TOKEN` | prod | — | Required for a Turso (non-file) URL. |
| `BETTER_AUTH_SECRET` | **yes** | — | `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | no | `http://localhost:3000` | Public HTTPS origin in prod. |
| `EXTENSION_ORIGIN` | **yes** | `chrome-extension://INVALID` | CORS allowlist; must equal the published extension ID. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | — | Enables Google OAuth. Point the callback at `BETTER_AUTH_URL`. |
| `RESEND_API_KEY` | no | — | Enables magic-link email (else links log to stdout). |
| `RESEND_FROM_EMAIL` | no | — | Verified sender address for Resend. |
| `LLM_PROVIDER` | no | auto | `anthropic` \| `openrouter`. Auto prefers Anthropic when both keys are set. |
| `ANTHROPIC_API_KEY` | no | — | Server-side AI (URL classification, summaries). |
| `OPENROUTER_API_KEY` | no | — | OpenAI-compatible gateway alternative. |
| `OPENROUTER_MODEL` | no | `google/gemini-2.0-flash-001` | Override the OpenRouter model. |
| `SECRETS_ENCRYPTION_KEY` | **prod** | — | 32-byte base64; encrypts user secrets at rest. Required to accept secret writes. |

Never commit `.env`, `.env.staging`, or `data.db`. Use your platform's secret
manager. Templates: `apps/server/.env.example`, `apps/server/.env.staging.example`.

---

## Extension (Chrome Web Store)

```bash
npm run build:production         # tsc -b --noEmit && vite build --mode production
# output: apps/extension/dist
cd apps/extension/dist && zip -r ../focusquote-extension.zip .
```

Upload the zip in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

A published Web Store extension has a **stable ID** (derived from the item's
key), unlike an unpacked dev build whose ID changes per machine. After the first
publish:

1. Copy the published extension ID from the dashboard.
2. Set `EXTENSION_ORIGIN=chrome-extension://<published-id>` on the server and
   restart it (CORS rejects any other origin).
3. If using Google OAuth, add the same `chrome-extension://<id>` to the
   authorized origins/redirect config in the Google Cloud console.

A `build:staging` mode exists for a separate staging extension build pointed at
the staging API.

---

## Staging

Identical flow with isolated resources. Copy `apps/server/.env.staging.example`
to `.env.staging`, fill in a separate Turso database, separate secrets, and the
staging extension ID, then use the `*:staging` scripts:

```bash
npm run db:migrate:staging
npm run start:staging
npm run build:staging          # extension, in apps/extension/
```
