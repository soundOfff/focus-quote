# FocusQuote — Manual UI Test Checklist

Step-by-step checklist for the surfaces that **cannot** be automated (Chrome blocks
external automation of an extension's own `chrome-extension://` pages: popup, new
tab, options, and the in-page toolbar's live state). Run these by hand in Chrome.

Companion to `manual-test-cases.md` (use-case catalog + API findings). Check the
box when a step passes; if it fails, note it and file an issue
(`gh issue create -R soundOfff/focus-quote --label bug …`).

---

## 0. Setup (do once)

- [ ] Backend running: `npm run dev:server` → `curl localhost:3000/health` returns `{"ok":true}`.
- [ ] Extension built + loaded: `npm run dev:extension`, then Chrome → `chrome://extensions` → Load unpacked → `apps/extension/dist/`.
- [ ] Note the **extension ID** shown on the card; confirm `EXTENSION_ORIGIN` in `apps/server/.env` matches `chrome-extension://<that-id>` (mismatch → CORS failures).
- [ ] Open DevTools for each surface while testing: popup (right-click → Inspect), service worker (extensions page → "service worker" link), content script (page DevTools → Console). **Watch the console for errors throughout — a clean run has none.**
- [ ] Have a second test account email available for multi-account checks.

> Tip: after editing extension source, a code reload does **not** re-inject the
> content script into already-open tabs. If the in-page toolbar/fonts are missing,
> reload the *tab*, not just the extension. Litmus: `document.querySelector('#focusquote-fonts-host')` should exist.

---

## 1. Authentication

### 1.1 Magic-link sign-in
- [ ] Open the popup while signed out → sign-in card is shown; session/timer controls are locked.
- [ ] Enter the test email → "send link" → confirm the success state ("check your email").
- [ ] Open the magic link → lands on the auth-callback page → tab **auto-closes**.
- [ ] Popup now shows the signed-in state without a manual refresh.
- [ ] DevTools → Application → Storage: a bearer token + user object are present in `chrome.storage.local`.
- [ ] The callback URL's `#token=…` fragment is **not** left in browser history (check `chrome://history`).

### 1.2 Google OAuth (window-close race — known fragile path)
- [ ] Popup → "Sign in with Google" → OAuth window opens.
- [ ] Complete consent. Sign-in completes and popup reflects it.
- [ ] **Race test:** start Google sign-in, then immediately close the popup before the OAuth window finishes. Re-open the popup → you should still be signed in (the service worker persists the result).

### 1.3 Sign-out / guest
- [ ] Settings → sign out → popup returns to the sign-in card; token cleared from storage.
- [ ] While signed out, select text on a page and save a quote → it persists locally (guest mode).
- [ ] Sign back in → the guest-saved quote drains to the server and appears in the list.

---

## 2. Popup

- [ ] Header shows branding + today's date + settings gear.
- [ ] "Today's Intent" band reflects the goal set on the new tab.
- [ ] Duration presets show 15 / 25 / 45 **plus** the user's configured default (default always present even if it equals a preset).
- [ ] Start a session → timer counts down; extension icon shows a session badge.
- [ ] Saved-quotes drawer: search box filters live; each card shows source + date + tags + delete.
- [ ] Delete a quote → it disappears and stays gone after closing/reopening the popup.
- [ ] "All" link opens the new tab on the full quote library.
- [ ] Stats line shows streak / sessions today / total quotes; numbers are plausible.
- [ ] Resize/zoom: popup (≈380×460) has no clipped controls or overflow.

---

## 3. New Tab

- [ ] Opening a new tab shows FocusQuote (greeting + daily quote + goal + stats).
- [ ] Tab nav (Overview / Sessions / Topics / History / Quotes) switches correctly.
- [ ] Selected tab **persists** across new-tab opens (`focusquote.home.mainTab`).
- [ ] Goal editor: set a goal → it shows in the popup band and survives reload.
- [ ] Sessions tab: recent session cards show title, date, duration, top URLs.
- [ ] Topics tab: topic graph renders; clicking a topic focuses it.
- [ ] Session detail overlay opens from a card and shows AI artifacts (see §6).

---

## 4. Options / Settings

- [ ] Account tab: change display name + headline → save → reflected after reload.
- [ ] Profile photo upload: pick a PNG/JPEG/WEBP → preview updates; pick a `.gif`/`.txt` → rejected with a clear message.
- [ ] **Large image (>10 MB):** upload → expect a graceful rejection, not a hang/crash (cross-check API finding #4 / issue #49).
- [ ] Session tab: change default duration/break (steppers clamp 1–180 / 0–60); change translation language pair.
- [ ] AI tab: master switch toggles all per-feature toggles; OpenRouter key field is password-type and saves (blur, ~250 ms debounce).
- [ ] **Secrets disabled path:** if the server has no `SECRETS_ENCRYPTION_KEY`, saving the key surfaces a clear error (503/SECRETS_DISABLED), not a silent failure.
- [ ] Privacy tab: edit blocklist; toggle URL tracking; toggle debug overlay.
- [ ] Data tab: Export JSON downloads a file containing quotes + sessions.
- [ ] Active options tab persists across reopen (`focusquote.options.activeTab`).
- [ ] Theme toggle (dark/light) updates the popup and new tab live.

---

## 5. Content-script toolbar (in-page, during a session)

> Start a focus session first, then open a normal article (e.g. Wikipedia).

- [ ] Floating toolbar appears once a session is active (and **not** before).
- [ ] Drag the grip to flip the toolbar left/right → position persists across reloads.
- [ ] Select text → selection bar appears with an inline translate button.
- [ ] Translate a selection (with a non-trivial language pair) → translated text shows; no console error on an unusual pair.
- [ ] Toolbar buttons: bell (notifications toggle), pencil (annotate modal), lightning (Quote+AI explain), wand (Guide Me), bookmark (vault link). Each opens/acts without console errors.
- [ ] **Reload storm:** reload the page several times mid-session → exactly **one** toolbar instance (no duplicates / stacked listeners).
- [ ] **Blocklist:** add the current host to the privacy blocklist → reload → toolbar is suppressed on that host.
- [ ] End the session → toolbar tears down cleanly (no orphaned UI, no leaked intervals/listeners in DevTools).

---

## 6. Session completion + AI artifacts

> Complete a session (let the timer finish or cancel-as-complete).

- [ ] On completion the popup toasts and/or the new tab navigates to the session detail.
- [ ] Detail shows: summary, study tips, recall questions, resource recommendations (each may lazy-load — a brief null then populated is OK).
- [ ] Recall: answer a question → it's graded (correct/partial/incorrect) with feedback; the attempt persists across reload (cross-device history).
- [ ] Force-regenerate one artifact → it clears and rebuilds.
- [ ] **AI-master-off mid-session:** start a session with AI on, toggle master OFF before completion → no *new* generations fire after the toggle (in-flight ones may finish).

---

## 7. Sync & offline (offline-first)

- [ ] DevTools → Network → set the SW/page offline. Save a quote + run a session.
- [ ] Re-enable network → within the sync interval (or via a manual action) the local writes drain to the server.
- [ ] Confirm server received them: `curl localhost:3000/api/quotes -H "Authorization: Bearer <token>"`.
- [ ] Second-device parity: load the new tab in a fresh profile signed into the same account → same quotes/sessions/goal appear.
- [ ] **SW lifecycle:** from `chrome://extensions`, stop the service worker mid-session → reopen the popup → session state is recovered from storage (timer continues or ends cleanly, no stuck "active" toolbar).

---

## 8. Cross-account isolation (manual confirmation of API findings)

> Two accounts in two Chrome profiles. These mirror the API IDORs (#46, #48) at the UI level.

- [ ] Account A's quotes/sessions/topics never appear in Account B's UI.
- [ ] Account B's profile photo never renders under Account A.
- [ ] Switching accounts in the same profile fully swaps the data set (no bleed-through).

---

## Result log

| Date | Build / commit | Sections run | Pass | Fail (→ issue) |
|------|----------------|--------------|------|----------------|
|      |                |              |      |                |
