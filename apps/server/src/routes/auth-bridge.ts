import { Hono } from "hono"
import { env } from "../env"

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
  return c.html(renderBridgeHtml(extOrigin))
})

const renderBridgeHtml = (extOrigin: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>FocusQuote — Signing in…</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; padding: 24px; color: #2d2d2d; display: flex; min-height: 70vh; align-items: center; justify-content: center; }
      .card { max-width: 360px; text-align: center; }
      h1 { color: #e94560; margin: 0 0 12px; font-size: 20px; }
      p { margin: 8px 0; font-size: 14px; }
      .err { color: #b00020; background: #fde7ea; padding: 8px 12px; border-radius: 8px; display: none; text-align: left; word-break: break-word; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>FocusQuote</h1>
      <p id="status">Signing you in…</p>
      <p id="error" class="err"></p>
    </div>
    <script>
      (function () {
        var EXT_ORIGIN = ${JSON.stringify(extOrigin)};
        var statusEl = document.getElementById("status");
        var errorEl = document.getElementById("error");
        function fail(msg) {
          statusEl.textContent = "Couldn't sign you in.";
          errorEl.textContent = msg;
          errorEl.style.display = "block";
        }
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
          .catch(function (err) { fail(err && err.message ? err.message : String(err)); });
      })();
    </script>
  </body>
</html>`
