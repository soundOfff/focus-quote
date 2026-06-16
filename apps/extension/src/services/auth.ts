import { Effect } from "effect"
import { StorageService } from "./storage"
import { AuthError } from "../shared/errors"
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from "../shared/auth-storage"
import type { User } from "@focus-quote/shared"

const AUTH_PATH_GET_SESSION = "/api/auth/get-session"
const AUTH_PATH_SIGN_IN_SOCIAL = "/api/auth/sign-in/social"
const AUTH_PATH_SIGN_IN_MAGIC_LINK = "/api/auth/sign-in/magic-link"
const AUTH_PATH_SIGN_OUT = "/api/auth/sign-out"

const apiUrl = (path: string) =>
  `${__API_BASE_URL__.replace(/\/+$/, "")}${path}`

/** Decodes the base64(utf8(JSON)) user payload produced by the server bridges. */
const decodeUser = (encoded: string): User => {
  const bin = atob(encoded)
  const json = decodeURIComponent(escape(bin))
  return JSON.parse(json) as User
}

export class AuthService extends Effect.Service<AuthService>()("AuthService", {
  effect: Effect.gen(function* () {
    const storage = yield* StorageService

    const currentUser: Effect.Effect<User | null, AuthError> = storage
      .get<User>(AUTH_USER_KEY)
      .pipe(
        Effect.map((u) => u ?? null),
        Effect.mapError(
          (cause) => new AuthError({ message: "load user failed", cause }),
        ),
      )

    const persistAuth = (token: string, user: User) =>
      Effect.gen(function* () {
        yield* storage
          .set(AUTH_TOKEN_KEY, token)
          .pipe(
            Effect.mapError(
              (cause) => new AuthError({ message: "save token", cause }),
            ),
          )
        yield* storage
          .set(AUTH_USER_KEY, user)
          .pipe(
            Effect.mapError(
              (cause) => new AuthError({ message: "save user", cause }),
            ),
          )
        // Migrate any guest-mode writes that piled up in the sync queue while
        // we were signed out. Fire-and-forget so a SW that isn't listening
        // (rare) doesn't fail the sign-in.
        yield* Effect.sync(() => {
          try {
            void chrome.runtime
              .sendMessage({ type: "focusquote.sync.now" } as const)
              .catch(() => {})
          } catch {
            // chrome.runtime may not be available in some test contexts.
          }
        })
      })

    const clearAuth = Effect.gen(function* () {
      yield* storage
        .remove(AUTH_TOKEN_KEY)
        .pipe(Effect.catchAll(() => Effect.void))
      yield* storage
        .remove(AUTH_USER_KEY)
        .pipe(Effect.catchAll(() => Effect.void))
    })

    /**
     * Fetches the active session via cookie auth and persists it.
     * Better Auth's bearer plugin returns the session token in the
     * `set-auth-token` response header — we capture that and store it
     * for use as a Bearer credential on subsequent API calls.
     */
    const fetchSessionAndPersist: Effect.Effect<User, AuthError> = Effect.gen(
      function* () {
        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(apiUrl(AUTH_PATH_GET_SESSION), {
              credentials: "include",
            }),
          catch: (cause) =>
            new AuthError({ message: "session fetch failed", cause }),
        })
        if (!res.ok) {
          return yield* Effect.fail(
            new AuthError({ message: `session fetch ${res.status}` }),
          )
        }
        const token = res.headers.get("set-auth-token") ?? ""
        const data = yield* Effect.tryPromise({
          try: () =>
            res.json() as Promise<{
              user: User
              session: unknown
            } | null>,
          catch: (cause) =>
            new AuthError({ message: "session JSON parse", cause }),
        })
        if (!data || !data.user) {
          return yield* Effect.fail(
            new AuthError({ message: "no active session" }),
          )
        }
        if (!token) {
          return yield* Effect.fail(
            new AuthError({
              message:
                "Backend did not return a bearer token. Make sure the bearer plugin is enabled.",
            }),
          )
        }
        yield* persistAuth(token, data.user)
        return data.user
      },
    )

    const signInGoogle: Effect.Effect<User, AuthError> = Effect.gen(
      function* () {
        // Where launchWebAuthFlow must land for Chrome to close the flow.
        const extRedirect = chrome.identity.getRedirectURL("oauth")
        // Point Better Auth's social callback at the same-origin OAuth bridge
        // (not directly at chromiumapp.org). The bridge reads the session
        // same-origin — where the SameSite cookie is actually sent — and
        // forwards the bearer token + user back to `extRedirect` in the URL
        // fragment. See apps/server/src/routes/auth-bridge.ts.
        const callbackURL = `${apiUrl("/auth/oauth-bridge")}?ext=${encodeURIComponent(
          extRedirect,
        )}`

        // Ask Better Auth for the Google authorization URL.
        const initRes = yield* Effect.tryPromise({
          try: () =>
            fetch(apiUrl(AUTH_PATH_SIGN_IN_SOCIAL), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ provider: "google", callbackURL }),
              credentials: "include",
            }),
          catch: (cause) =>
            new AuthError({ message: "init social failed", cause }),
        })
        if (!initRes.ok) {
          return yield* Effect.fail(
            new AuthError({
              message: `init social ${initRes.status} (check GOOGLE_CLIENT_ID/SECRET and EXTENSION_ORIGIN on the server)`,
            }),
          )
        }
        const initData = yield* Effect.tryPromise({
          try: () => initRes.json() as Promise<{ url?: string }>,
          catch: (cause) =>
            new AuthError({ message: "init social JSON", cause }),
        })
        if (!initData.url) {
          return yield* Effect.fail(
            new AuthError({ message: "no redirect URL from server" }),
          )
        }

        // Open the OAuth flow; resolves with the chromiumapp.org URL (carrying
        // the token + user in its fragment) after the bridge redirects back.
        const responseUrl = yield* Effect.async<string, AuthError>((resume) => {
          chrome.identity.launchWebAuthFlow(
            { url: initData.url!, interactive: true },
            (responseUrl) => {
              if (chrome.runtime.lastError) {
                resume(
                  Effect.fail(
                    new AuthError({
                      message:
                        chrome.runtime.lastError.message ??
                        "launchWebAuthFlow error",
                    }),
                  ),
                )
                return
              }
              if (!responseUrl) {
                resume(
                  Effect.fail(new AuthError({ message: "no response URL" })),
                )
                return
              }
              resume(Effect.succeed(responseUrl))
            },
          )
        })

        // The bridge put the bearer token + user in the URL fragment.
        const parsed = yield* Effect.try({
          try: () => new URL(responseUrl),
          catch: (cause) =>
            new AuthError({ message: "bad OAuth response URL", cause }),
        })
        const hash = parsed.hash.startsWith("#")
          ? parsed.hash.slice(1)
          : parsed.hash
        const fragment = new URLSearchParams(hash)
        const token = fragment.get("token")
        const userParam = fragment.get("user")
        if (!token || !userParam) {
          return yield* Effect.fail(
            new AuthError({
              message: "OAuth callback missing token or user",
            }),
          )
        }
        const user = yield* Effect.try({
          try: () => decodeUser(userParam),
          catch: (cause) =>
            new AuthError({ message: "OAuth user decode failed", cause }),
        })
        yield* persistAuth(token, user)
        return user
      },
    )

    const signInMagicLink = (email: string): Effect.Effect<void, AuthError> =>
      Effect.gen(function* () {
        const callbackURL = chrome.runtime.getURL(
          "src/auth-callback/index.html",
        )
        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(apiUrl(AUTH_PATH_SIGN_IN_MAGIC_LINK), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, callbackURL }),
            }),
          catch: (cause) =>
            new AuthError({ message: "magic link request failed", cause }),
        })
        if (!res.ok) {
          const text = yield* Effect.promise(() =>
            res.text().catch(() => ""),
          )
          return yield* Effect.fail(
            new AuthError({
              message: `magic link ${res.status}: ${text.slice(0, 200)}`,
            }),
          )
        }
      })

    const signOut: Effect.Effect<void, never> = Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          fetch(apiUrl(AUTH_PATH_SIGN_OUT), {
            method: "POST",
            credentials: "include",
          }),
        catch: () => null,
      }).pipe(Effect.catchAll(() => Effect.void))
      // Wipe all locally cached state so no data from the signed-in account
      // lingers for the next session. Falls back to clearing just the auth
      // keys if a full clear fails for any reason.
      yield* storage
        .clear()
        .pipe(Effect.catchAll(() => clearAuth))
      // Tell every other open extension surface (new tab, options, popup) that
      // the session ended so they can reload from the now-empty storage instead
      // of rendering stale in-memory data. Fire-and-forget — a surface that
      // isn't listening must not fail the sign-out.
      yield* Effect.sync(() => {
        try {
          void chrome.runtime
            .sendMessage({ type: "focusquote.auth.signedOut" } as const)
            .catch(() => {})
        } catch {
          // chrome.runtime may not be available in some test contexts.
        }
      })
    })

    return {
      currentUser,
      signInGoogle,
      signInMagicLink,
      signOut,
      fetchSessionAndPersist,
    }
  }),
  dependencies: [StorageService.Default],
}) {}
