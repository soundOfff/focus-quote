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
        const callbackURL = chrome.identity.getRedirectURL("oauth")

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
              message: `init social ${initRes.status} (is GOOGLE_CLIENT_ID set on the server?)`,
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

        // Open the OAuth flow; resolves with the chromiumapp.org URL after
        // Better Auth completes the dance.
        yield* Effect.async<string, AuthError>((resume) => {
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

        return yield* fetchSessionAndPersist
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
      yield* clearAuth
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
