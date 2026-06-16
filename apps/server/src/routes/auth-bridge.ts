import { Hono } from "hono"
import { env } from "../env"
import { auth, chromiumAppOrigin } from "../auth"

/**
 * Bridge page for chrome-extension magic-link sign-in.
 *
 * The email link points here (same origin as the API) instead of directly at
 * Better Auth's /api/auth/magic-link/verify with a chrome-extension://
 * callbackURL. That direct flow loses the bearer token: Better Auth's verify
 * endpoint issues a 302 to the extension origin, and the response headers
 * (including `set-auth-token` from the bearer plugin) are dropped by the
 * browser before the extension page can read them.
 *
 * This bridge runs same-origin, calls verify without a callbackURL so it
 * returns JSON with the session token, then redirects to the extension's
 * auth-callback page with the token + user in the URL fragment.
 */
export const authBridgeRoutes = new Hono().get("/", (c) => {
  const extOrigin = env.EXTENSION_ORIGIN
  return c.html(renderMagicBridgeHtml(extOrigin))
})

/**
 * Bridge page for chrome-extension Google (OAuth) sign-in.
 *
 * `chrome.identity.launchWebAuthFlow` requires the OAuth flow to end on
 * `https://<extension-id>.chromiumapp.org/...`, but the bearer token needed by
 * the extension can't be read from there: a `GET /api/auth/get-session` from
 * the extension origin is cross-site, so the browser drops the `SameSite=Lax`
 * session cookie and the request comes back unauthenticated.
 *
 * Better Auth's social callback is pointed at this bridge (same origin as the
 * API) instead. Running same-origin, the freshly-set session cookie IS sent.
 *
 * We resolve the session SERVER-SIDE here rather than fetching get-session
 * from the page: the bearer plugin only emits the `set-auth-token` header when
 * a response re-sets the session cookie, which get-session does NOT do right
 * after a fresh OAuth sign-in (the session was created in the preceding
 * /api/auth/callback/google request). So a client-side read of that header
 * comes back null. Reading the session server-side gives us the token
 * directly, and we hand it to the extension via the chromiumapp.org URL
 * fragment — mirroring the magic-link bridge above.
 */
export const oauthBridgeRoutes = new Hono().get("/", async (c) => {
  const ext = c.req.query("ext") ?? null
  let payload: { token: string; user: unknown } | null = null
  let error: string | null = null
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session || !session.user) {
      error = "No active session after OAuth."
    } else {
      payload = { token: session.session.token, user: session.user }
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
  }
  return c.html(
    renderOAuthBridgeHtml(chromiumAppOrigin, ext, payload, error),
  )
})

/**
 * Serialize a value for safe embedding inside an inline <script>. Escaping `<`
 * prevents a `</script>` sequence (or any markup) inside user-controlled data
 * from breaking out of the script context.
 */
const jsonForScript = (value: unknown): string =>
  JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/[\u2028\u2029]/g, (ch) =>
      ch === "\u2028" ? "\\u2028" : "\\u2029",
    )

/**
 * Shared chrome for both bridge pages, styled to match the FocusQuote app's
 * warm "paper" palette (see apps/extension/src/styles/tailwind.css):
 * paper surface, ink text, amber accent, clay error tint, serif wordmark.
 */
const renderBridgeShell = (scriptBody: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>FocusQuote — Signing in…</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #E9E7E1;
        color: #3A362F;
        font-family: "Geist Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .card {
        width: 100%;
        max-width: 340px;
        text-align: center;
        background: #FBFAF6;
        border: 1px solid #E5E0D5;
        border-radius: 14px;
        padding: 36px 28px;
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.7) inset,
          0 12px 28px -12px rgba(40, 30, 15, 0.18),
          0 2px 6px -2px rgba(40, 30, 15, 0.10);
      }
      .spinner {
        width: 22px;
        height: 22px;
        margin: 0 auto 16px;
        border-radius: 9999px;
        border: 2.5px solid #FBE6C8;
        border-top-color: #F2A03C;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        .spinner { animation: none; }
      }
      h1 {
        margin: 0 0 6px;
        font-family: Newsreader, "Iowan Old Style", Georgia, "Times New Roman", serif;
        font-weight: 600;
        font-size: 22px;
        letter-spacing: -0.01em;
        color: #1A1814;
      }
      p { margin: 0; font-size: 14px; color: #807A6F; }
      .err {
        display: none;
        margin-top: 18px;
        padding: 10px 12px;
        text-align: left;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.45;
        color: #A04B26;
        background: #F2DDD3;
        border: 1px solid rgba(160, 75, 38, 0.18);
        border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="spinner" id="spinner"></div>
      <h1>FocusQuote</h1>
      <p id="status">Signing you in…</p>
      <p id="error" class="err"></p>
    </div>
    <script>
      (function () {
        var statusEl = document.getElementById("status");
        var errorEl = document.getElementById("error");
        var spinnerEl = document.getElementById("spinner");
        function fail(msg) {
          if (spinnerEl) spinnerEl.style.display = "none";
          statusEl.textContent = "Couldn't sign you in.";
          errorEl.textContent = msg;
          errorEl.style.display = "block";
        }
${scriptBody}
      })();
    </script>
  </body>
</html>`

const renderMagicBridgeHtml = (extOrigin: string) =>
  renderBridgeShell(`        var EXT_ORIGIN = ${jsonForScript(extOrigin)};
        var params = new URLSearchParams(window.location.search);
        var vt = params.get("vt");
        var ext = params.get("ext");
        if (!vt) return fail("Missing verification token.");
        if (!ext) return fail("Missing extension callback URL.");
        // Only redirect to the configured extension origin — prevents this
        // route being used as an open redirect.
        var extUrl;
        try { extUrl = new URL(ext); } catch (_) { return fail("Invalid callback URL."); }
        if (extUrl.protocol !== "chrome-extension:" || extUrl.origin !== EXT_ORIGIN) {
          return fail("Callback URL is not a trusted extension origin.");
        }
        fetch("/api/auth/magic-link/verify?token=" + encodeURIComponent(vt), {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        })
          .then(function (res) {
            if (!res.ok) {
              return res.text().then(function (t) {
                throw new Error("verify " + res.status + ": " + t.slice(0, 200));
              });
            }
            return res.json();
          })
          .then(function (data) {
            if (!data || !data.token || !data.user) {
              throw new Error("verify response missing token or user");
            }
            var hash = new URLSearchParams();
            hash.set("token", data.token);
            hash.set("user", btoa(unescape(encodeURIComponent(JSON.stringify(data.user)))));
            extUrl.hash = hash.toString();
            window.location.replace(extUrl.toString());
          })
          .catch(function (err) { fail(err && err.message ? err.message : String(err)); });`)

const renderOAuthBridgeHtml = (
  chromiumOrigin: string | null,
  ext: string | null,
  payload: { token: string; user: unknown } | null,
  serverError: string | null,
) =>
  renderBridgeShell(`        var CHROMIUM_ORIGIN = ${jsonForScript(chromiumOrigin)};
        var EXT = ${jsonForScript(ext)};
        var PAYLOAD = ${jsonForScript(payload)};
        var SERVER_ERROR = ${jsonForScript(serverError)};
        if (SERVER_ERROR) return fail(SERVER_ERROR);
        if (!CHROMIUM_ORIGIN) {
          return fail("Server is missing EXTENSION_ORIGIN — can't redirect back to the extension.");
        }
        if (!EXT) return fail("Missing extension callback URL.");
        if (!PAYLOAD || !PAYLOAD.token || !PAYLOAD.user) {
          return fail("Backend did not establish a session after OAuth.");
        }
        // Only redirect to this extension's chromiumapp.org origin — prevents
        // this route being used as an open redirect.
        var extUrl;
        try { extUrl = new URL(EXT); } catch (_) { return fail("Invalid callback URL."); }
        if (extUrl.origin !== CHROMIUM_ORIGIN) {
          return fail("Callback URL is not a trusted extension origin.");
        }
        var hash = new URLSearchParams();
        hash.set("token", PAYLOAD.token);
        hash.set("user", btoa(unescape(encodeURIComponent(JSON.stringify(PAYLOAD.user)))));
        extUrl.hash = hash.toString();
        window.location.replace(extUrl.toString());`)
