# FocusQuote — Manual QA Test Cases & Findings

Living QA document. The "Full Case" is the flagship end-to-end scenario; the
case catalog breaks it into independently-runnable use cases. The findings list
at the bottom is the running bug list — each entry links to its GitHub issue.

> **Tooling note:** Chrome forbids the Claude-in-Chrome automation extension from
> driving another extension's `chrome-extension://` pages, so the popup / new tab /
> options UIs must be exercised **manually**. The **content script** (on normal web
> pages) and the **backend API** (`localhost:3000`) are automatable and were tested
> directly. API cases below were executed with two real users (A, B) and bearer
> tokens pulled from `apps/server/data.db`.
>
> **Manual UI checklist:** step-by-step for the non-automatable surfaces lives in
> [`manual-ui-checklist.md`](./manual-ui-checklist.md).

---

## Full Case — "Capture-to-Recall study loop"

A signed-in user runs one complete study cycle:

1. **Sign in** (magic link or Google OAuth) → bearer token stored.
2. **Set today's goal** on the new tab ("Understand transformer attention").
3. **Start a 25/5 focus session** from the popup.
4. **Read an article** (Wikipedia) → content-script toolbar + selection bar appear.
5. **Capture 2–3 quotes** via the selection bar; add tags.
6. **Save a page to the vault** via the bookmark toolbar button.
7. **End the session** (timer completes).
8. **Review the AI session report** on the new tab: summary, study tips,
   recall questions (answer + grade), resource recommendations.
9. **Verify sync**: reload — quotes, session, goal all persisted to the server.
10. **Sign out** → guest mode; local-only operations still work.

Pass = every step completes with correct data, no console errors, and a second
device (or a fresh load) sees the same server state.

---

## Use-Case Catalog

### Authentication
- **UC-A1** Magic-link sign-in stores token + user, closes callback tab, clears fragment.
- **UC-A2** Google OAuth completes even if the popup is closed mid-flow (SW persists state).
- **UC-A3** All `/api/*` routes return **401** without a token. ✅ verified
- **UC-A4** Garbage/expired bearer token → **401**, never 500. ✅ verified
- **UC-A5** Sign-out clears local token; guest mode still allows local quote saves.

### Quotes
- **UC-Q1** Select text → selection bar → save → quote appears in popup list.
- **UC-Q2** Duplicate text (same trimmed content) dedupes via `(userId, contentHash)`.
- **UC-Q3** Empty quote text rejected with **400**. ✅ verified
- **UC-Q4** List pagination clamps `limit` to 1..200 (out-of-range → **400**). ✅ verified
- **UC-Q5** Search filters by substring; **must not** treat `%`/`_` as wildcards. ❌ **FINDING #2**
- **UC-Q6** Delete only removes the caller's own quote (404 otherwise).

### Focus sessions
- **UC-S1** Start/upsert session persists goal, duration, break.
- **UC-S2** Completing a session triggers the AI completion pipeline (summary/recall/etc.).
- **UC-S3** Lazy regeneration: GET artifact on a completed session with null value re-generates.
- **UC-S4** Force-regenerate clears + rebuilds a single artifact.
- **UC-S5** Assign-topic and vault-link reject non-owned session ids (**404**). ✅ verified safe

### Cross-user isolation (security)
- **UC-X1** GET endpoints never return another user's rows (scoped by `userId`). ✅ verified safe
- **UC-X2** A user **cannot overwrite** another user's session/quote by id. ❌ **FINDING #1 (critical)**
- **UC-X3** `upsertSessionUrl` / `upsertChatThread` reject foreign session/thread ids. ✅ verified safe
- **UC-X4** A user cannot read another user's media `fileId` (direct or via topic attach). ❌ **FINDING #3** (direct GET safe; topic-attach leaks)

### Media uploads
- **UC-M1** 10 MB cap enforced against the *real* payload, not a client-supplied number. ❌ **FINDING #4**
- **UC-M2** Disallowed MIME types rejected with **400**. ✅ verified safe (`ALLOWED_MIME` gate)
- **UC-M3** `sessionId` on upload must belong to the caller (**404** otherwise). ✅ verified safe

### Content script (web page surface)
- **UC-C1** Fonts + scrollbar host inject on every page without errors. ✅ verified
- **UC-C2** Selection/toolbar only render during an active session. ✅ verified
- **UC-C3** Rapid reloads during a session don't multiply the toolbar.
- **UC-C4** Privacy blocklist suppresses the toolbar on blocked hosts.

### Settings / privacy / AI
- **UC-P1** `recallQuestionCount` clamps 1..15 server-side. ✅ verified (schema)
- **UC-P2** Duration 1..180, break 0..60 enforced server-side. ✅ verified (schema)
- **UC-P3** Toggling AI master off mid-session stops new generations.
- **UC-P4** OpenRouter key save fails gracefully when secrets are disabled server-side.
- **UC-AI1** Every paid LLM endpoint is rate-limited per user. ❌ **FINDING #5** (only `guide-steps` is)
- **UC-AI2** AI endpoints re-check the server-side AI gate (403 `AI_DISABLED`). ✅ verified safe
- **UC-AI3** `quote-assistant`/`guide-steps` prompt inputs are length-capped. ✅ verified safe (8 KB/20 KB/150 elems)
- **UC-AI4** AI chat threads/messages reject foreign thread ids (404). ✅ verified safe

### Auth bridges
- **UC-B1** Magic-link bridge rejects callback URLs not matching `EXTENSION_ORIGIN` (no open redirect). ✅ verified safe
- **UC-B2** OAuth bridge rejects callbacks not matching the `chromiumapp.org` origin. ✅ verified safe
- **UC-B3** Token/user embedded in bridge HTML is script-escaped (no `</script>` breakout / XSS). ✅ verified safe

---

## Findings (running bug list)

All findings below were fixed and verified live on branch `qa/security-fixes`.

| # | Severity | Case | Summary | Issue | Status |
|---|----------|------|---------|-------|--------|
| 1 | 🔴 Critical (security) | UC-X2 | Authenticated user can silently overwrite another user's session/quote via unscoped `onConflictDoUpdate` (REST `POST /api/focus-sessions`, sync `upsertSession`/`upsertQuote`) | [#46](https://github.com/soundOfff/focus-quote/issues/46) | ✅ fixed (`b585252`) |
| 2 | 🟡 Low | UC-Q5 | Quote search treats `%` and `_` as SQL `LIKE` wildcards (unescaped) — `?q=%` returns all quotes | [#47](https://github.com/soundOfff/focus-quote/issues/47) | ✅ fixed (`0cee3f4`) |
| 3 | 🟠 High (security) | UC-X4 | Cross-user media read leak: `POST /api/topics/:label/media` skips file-ownership check, so a user can attach + read another user's `fileId` (profile photos) | [#48](https://github.com/soundOfff/focus-quote/issues/48) | ✅ fixed (`b585252`) |
| 4 | 🟡 Medium | UC-M1 | Media 10 MB cap bypassable — `byteSize` is client-supplied, `dataBase64` unbounded, no global body limit | [#49](https://github.com/soundOfff/focus-quote/issues/49) | ✅ fixed (`0cee3f4`) |
| 5 | 🟡 Medium | UC-AI1 | Rate limiting only covers `guide-steps`; `quote-assistant`/`recall-grade`/`regenerate` paid LLM calls are unthrottled | [#50](https://github.com/soundOfff/focus-quote/issues/50) | ✅ fixed (`0cee3f4`) |
