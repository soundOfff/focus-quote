# FocusQuote - Claude Project Instructions

## Project Overview

FocusQuote is a Chrome extension + backend for capturing web quotes and running goal-oriented focus sessions with AI-powered distraction detection. This is a monorepo using npm workspaces.

**Architecture:**
- `apps/extension/` - Chrome MV3 extension (Preact + Tailwind + Effect)
- `apps/server/` - REST API (Hono + Drizzle + libSQL/Turso + Better Auth + Anthropic SDK)
- `packages/shared/` - Effect Schema types + API contracts (shared between extension & server)

## Core Tech Stack & Patterns

### Effect (Functional Programming)

**Extension state management uses Effect throughout:**
- All services are Effect services (`QuotesService`, `SessionsService`, `StorageService`, etc.)
- Use `Effect.gen` for async operations instead of async/await
- Use `yield*` to unwrap Effect values inside generators
- Pattern:
  ```typescript
  const doSomething = Effect.gen(function* () {
    const storage = yield* StorageService
    const data = yield* storage.get("key")
    return data
  })
  ```
- Run Effects in UI components with the runtime helper (`runP` in extension)
- Never use `.runPromise()` directly in service code; services should compose Effects

### Shared Types (Effect Schema)

**All API contracts live in `packages/shared/src/`:**
- Use `Schema.Struct` for object shapes
- Use branded types for IDs: `Schema.String.pipe(Schema.brand("QuoteId"))`
- Export both the schema and the inferred TypeScript type:
  ```typescript
  export const Quote = Schema.Struct({ id: QuoteId, ... })
  export type Quote = Schema.Schema.Type<typeof Quote>
  ```
- Server validates with Zod (converted from Effect Schema), extension uses Effect Schema directly
- **Never duplicate type definitions** - import from `@focus-quote/shared`

### Extension (Preact + Chrome APIs)

**Component patterns:**
- Use Preact hooks (`useState`, `useEffect`, `useMemo`) from `preact/hooks`
- Icons from `lucide-preact`
- Tailwind for styling (no CSS modules, no inline style objects for complex styles)
- Chrome storage accessed via `StorageService` Effect service, never directly via `chrome.storage`
- Message passing between extension contexts uses typed messages from `shared/messages.ts`

**Extension architecture:**
- Background service worker handles alarms, sync, chrome.webNavigation events
- Content script handles quote capture (floating button, text selection)
- Popup is the main UI (timer, quotes, sign-in)
- New tab page shows greeting + daily goal
- Options page for settings

**State persistence:**
- Local state in `chrome.storage.local` via `StorageService`
- Server state synced via offline-first queue (writes go to local storage first, drained to API periodically)

### Server (Hono + Drizzle)

**API route patterns:**
```typescript
export const quotesRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)  // Auth middleware
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const userId = c.get("user").id
    const query = c.req.valid("query")
    // ... Drizzle query
    return c.json({ data: rows })
  })
```

**Database (Drizzle + libSQL):**
- Schema lives in `apps/server/src/db/schema.ts`
- Use `drizzle-orm` query builder, not raw SQL
- Migrations are generated via `npm run db:generate` in `apps/server/`
- Migrations auto-run on server start (see `migrate.ts`)
- All user-scoped queries MUST filter by `eq(table.userId, userId)` to prevent data leaks

**Authentication:**
- Better Auth handles magic-link email + Google OAuth
- Extension gets a bearer token after sign-in, stores in `chrome.storage.local`
- All authenticated routes use `requireUser` middleware
- Token passed in `Authorization: Bearer <token>` header

## Code Quality Standards

### TypeScript

- **Strict mode enabled** (`tsconfig.base.json` has `"strict": true` and `"noUncheckedIndexedAccess": true`)
- Always handle nullable values explicitly (no `!` assertions unless absolutely necessary)
- Use discriminated unions for state variants
- Prefer `const` over `let`
- Use `type` for object shapes, `interface` only when needed for declaration merging

### Error Handling

**Extension:**
- Custom error classes in `shared/errors.ts` (`NetworkError`, `SignedOutError`, etc.)
- Effect services should return `Effect<A, E, R>` with explicit error types
- Catch and display user-facing errors in UI with toast notifications

**Server:**
- Return proper HTTP status codes (404 for not found, 401 for unauthorized, 500 for server errors)
- Validate all inputs with Zod schemas via `zValidator`
- Never expose internal error details to clients (log them server-side)

### Security

**Critical security rules:**
1. **Never trust client input** - validate everything with schemas
2. **Always scope by userId** - every DB query for user data must filter by `userId`
3. **CORS is strict** - only allow requests from `EXTENSION_ORIGIN` (set in `.env`)
4. **No secrets in extension code** - API keys for Anthropic/OpenRouter must stay server-side
5. **Rate limiting** - implement for expensive operations (AI calls, email sending)
6. **SQL injection prevention** - use Drizzle's query builder, never string concatenation
7. **XSS prevention** - Preact escapes by default, be careful with `dangerouslySetInnerHTML`

## Database & Migrations

### When to create a migration:

1. Edit `apps/server/src/db/schema.ts`
2. Run `cd apps/server && npm run db:generate` - this creates a new migration file
3. Run `npm run db:migrate` to apply it locally (or restart dev server)
4. **Commit both the schema change AND the generated migration**

### Migration best practices:

- Make migrations backwards-compatible when possible (add nullable columns first, backfill data, then add NOT NULL constraint in a later migration)
- Never edit an already-deployed migration - create a new one
- Test migrations locally before pushing

## API Design

### Request/Response contracts:

1. Define schemas in `apps/server/src/lib/api-schemas.ts` (Zod)
2. Define TypeScript types in `packages/shared/src/api-contracts.ts` (or similar) if needed by extension
3. Use `zValidator` middleware for all routes that accept input
4. Return consistent JSON shapes: `{ data: T }` for success, `{ error: string }` for errors

### Pagination:

- Use `limit` query param (default 50, max 100)
- Return full result set for now (cursor pagination can be added later if needed)

### Versioning:

- No `/v1/` prefix yet - keep routes simple
- If breaking changes needed, coordinate a migration plan (update extension + server together)

## AI/LLM Integration

**Anthropic SDK usage:**
- API key stored in `ANTHROPIC_API_KEY` env var (server-side only)
- Helper functions in `apps/server/src/lib/llm.ts`
- Use Haiku for fast, cheap classification (URL scoring)
- Use Sonnet for richer content (session summaries, study tips)
- Always handle rate limits and API errors gracefully
- Never send sensitive user data to LLM without explicit consent (check privacy settings)

**Prompt patterns:**
- Keep prompts concise and specific
- Use structured output (JSON mode) when possible
- Cache system prompts for repeated calls (Anthropic prompt caching)

## Chrome Extension Specifics

### Manifest V3 considerations:

- Service worker has no DOM access (use content scripts for page interaction)
- Use `chrome.alarms` for scheduled tasks (not `setTimeout` in background)
- Externally connectable only from trusted domains
- Content Security Policy is strict (no inline scripts, no `eval`)

### Common gotchas:

- **Extension ID changes** between dev builds - update `EXTENSION_ORIGIN` in `.env` when reloading unpacked extension
- **Service worker lifecycle** - background SW can be killed anytime; persist state to `chrome.storage`
- **Content script isolation** - content script has separate JS context from page (cannot access page's variables directly)
- **Vite HMR** - works for popup/options/newtab, but service worker/content script need full reload

## Development Workflow

### Running locally:

```bash
# Terminal 1 - Backend on http://localhost:3000
npm run dev:server

# Terminal 2 - Extension with HMR
npm run dev:extension
```

### Before committing:

1. **Run typechecking**: `npm run typecheck` (must pass with no errors)
2. **Test manually** - load extension in Chrome, test the feature you changed
3. **Check git status** - don't commit `.env`, `data.db`, or `node_modules`
4. **Conventional commits** - use prefix: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

### Testing:

- Unit tests: not yet implemented (add as needed with Vitest)
- Manual testing is primary QA method for now
- Always test:
  - Sign-in/sign-out flow if touching auth
  - Offline behavior if touching sync
  - Cross-extension contexts (popup ↔ background ↔ content script) if touching message passing

## What to Maintain

### Always maintain:

1. **Type safety** - no `any`, no unchecked indexing, no `!` assertions without comments
2. **Consistent Effect patterns** - use `Effect.gen` and `yield*` in services
3. **Shared types** - keep `packages/shared/` in sync with server API and extension usage
4. **Migrations** - generate and commit DB migrations for schema changes
5. **README accuracy** - update setup instructions if env vars or dependencies change
6. **Git hygiene** - conventional commits, no secrets, no generated files
7. **CORS config** - keep extension origin allowlist strict
8. **User data scoping** - all queries filter by `userId`

### Don't over-engineer:

- No premature abstractions (3+ similar uses before extracting a helper)
- No complex state machines until needed (useState/useEffect is fine for simple cases)
- No elaborate caching strategies (Drizzle query caching + Effect is enough for now)
- No microservices split (keep API in single Hono app)

### Avoid:

- ❌ Raw SQL queries (use Drizzle)
- ❌ `@ts-ignore` or `@ts-expect-error` without explanation
- ❌ Storing sensitive data in `chrome.storage` (tokens are okay, API keys are not)
- ❌ Bypassing auth middleware on server routes
- ❌ Using `runPromise()` in Effect service definitions (compose Effects, run at edges)
- ❌ Duplicate API request/response types (import from `@focus-quote/shared`)
- ❌ Mutation of shared state (use immutable updates)

## Common Tasks

### Adding a new API endpoint:

1. Define schema in `apps/server/src/lib/api-schemas.ts`
2. Add TypeScript types in `packages/shared/src/api-contracts.ts`
3. Create route handler in `apps/server/src/routes/`
4. Mount route in `apps/server/src/app.ts`
5. Add client method in `apps/extension/src/services/api.ts`
6. Use in UI component via Effect service

### Adding a new DB table:

1. Add table definition to `apps/server/src/db/schema.ts`
2. Run `cd apps/server && npm run db:generate`
3. Review generated migration in `apps/server/drizzle/`
4. Run `npm run db:migrate` or restart dev server
5. Add CRUD routes in `apps/server/src/routes/`
6. Update Effect Schema types in `packages/shared/src/schema.ts` if needed

### Adding a new preference/setting:

1. Add field to `Prefs` type in `apps/extension/src/shared/prefs.ts`
2. Add default value in `defaultPrefs`
3. If needs server sync, add to `GetUserSettingsResponse` / `UpdateUserSettingsRequest` in `packages/shared/`
4. Add UI control in `apps/extension/src/options/App.tsx` or `apps/extension/src/popup/components/SettingsView.tsx`
5. Use via `loadPrefs` Effect helper

### Adding a new Chrome permission:

1. Add to `manifest.json` in `apps/extension/public/`
2. Document why it's needed in README
3. Request at runtime if it's optional: `chrome.permissions.request({ permissions: ["..."] })`

## Deployment

**Extension:**
- Build: `npm run build:extension`
- Creates production bundle in `apps/extension/dist/`
- Zip `dist/` folder and upload to Chrome Web Store

**Server:**
- Production env: Turso (libSQL cloud) + serverless runtime (Cloudflare Workers or similar)
- Set `DATABASE_URL` to Turso connection string
- Set `BETTER_AUTH_URL` to production domain
- Run migrations: `npm run db:migrate` in `apps/server/` before deploying new code

## Project Philosophy

- **Offline-first** - extension should work without network, sync when available
- **Privacy-conscious** - AI features are opt-in, user controls data sharing
- **Fast and lightweight** - minimize bundle size, lazy-load heavy dependencies
- **Type-safe** - rely on TypeScript to catch bugs at compile time
- **Effect-driven** - embrace functional composition, avoid imperative side-effects in services
- **Incremental** - ship small, test often, iterate based on usage

---

**When in doubt:**
- Check existing patterns in the codebase
- Prioritize user data safety and privacy
- Test manually in Chrome before pushing
- Ask clarifying questions rather than guessing
