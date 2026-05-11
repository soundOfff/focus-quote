import { Effect, Schedule } from "effect"
import { StorageService } from "./storage"
import { NetworkError, SignedOutError } from "../shared/errors"
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from "../shared/auth-storage"
import type {
  ListQuotesResponse,
  SaveQuoteRequest,
  SaveQuoteResponse,
  DeleteQuoteResponse,
  ListSessionsResponse,
  UpsertSessionRequest,
  UpsertSessionResponse,
  SessionUrlBatchRequest,
  SessionUrlBatchResponse,
  ListSessionUrlsResponse,
  SyncBatchRequest,
  SyncBatchResponse,
  MeResponse,
} from "@focus-quote/shared"

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PUT"
  json?: unknown
  query?: Record<string, string | number | undefined>
}

const buildUrl = (
  path: string,
  query?: Record<string, string | number | undefined>,
) => {
  const base = __API_BASE_URL__.replace(/\/+$/, "")
  const url = new URL(`${base}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

const retryPolicy = Schedule.exponential("400 millis").pipe(
  Schedule.intersect(Schedule.recurs(2)),
)

export class ApiService extends Effect.Service<ApiService>()("ApiService", {
  effect: Effect.gen(function* () {
    const storage = yield* StorageService

    const request = <T>(
      path: string,
      options: RequestOptions = {},
    ): Effect.Effect<T, NetworkError | SignedOutError> =>
      Effect.gen(function* () {
        const token = yield* storage
          .get<string>(AUTH_TOKEN_KEY)
          .pipe(Effect.catchAll(() => Effect.succeed(null)))

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        }
        if (token) headers.Authorization = `Bearer ${token}`

        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(buildUrl(path, options.query), {
              method: options.method ?? "GET",
              headers,
              body:
                options.json !== undefined
                  ? JSON.stringify(options.json)
                  : undefined,
            }),
          catch: (cause) =>
            new NetworkError({ message: "fetch failed", cause }),
        })

        if (res.status === 401) {
          yield* storage
            .remove(AUTH_TOKEN_KEY)
            .pipe(Effect.catchAll(() => Effect.void))
          yield* storage
            .remove(AUTH_USER_KEY)
            .pipe(Effect.catchAll(() => Effect.void))
          return yield* Effect.fail(
            new SignedOutError({ message: "Session expired or missing" }),
          )
        }

        if (!res.ok) {
          const text = yield* Effect.promise(() =>
            res.text().catch(() => ""),
          )
          return yield* Effect.fail(
            new NetworkError({
              message: `HTTP ${res.status}: ${text.slice(0, 200)}`,
              status: res.status,
            }),
          )
        }

        // Some endpoints (e.g. delete) may return empty body with 200/204
        const contentType = res.headers.get("content-type") ?? ""
        if (!contentType.includes("application/json")) {
          return undefined as T
        }
        return yield* Effect.tryPromise({
          try: () => res.json() as Promise<T>,
          catch: (cause) =>
            new NetworkError({ message: "bad JSON", cause }),
        })
      }).pipe(
        Effect.retry({
          schedule: retryPolicy,
          while: (e) =>
            e._tag === "NetworkError" &&
            (e.status === undefined || e.status >= 500),
        }),
      )

    return {
      // Quotes
      listQuotes: (query?: { q?: string; limit?: number }) =>
        request<ListQuotesResponse>("/api/quotes", { query }),
      saveQuote: (body: SaveQuoteRequest) =>
        request<SaveQuoteResponse>("/api/quotes", {
          method: "POST",
          json: body,
        }),
      deleteQuote: (id: string) =>
        request<DeleteQuoteResponse>(`/api/quotes/${id}`, {
          method: "DELETE",
        }),

      // Focus sessions
      listSessions: () =>
        request<ListSessionsResponse>("/api/focus-sessions"),
      upsertSession: (body: UpsertSessionRequest) =>
        request<UpsertSessionResponse>("/api/focus-sessions", {
          method: "POST",
          json: body,
        }),

      // Session URLs (AI analysis)
      postSessionUrls: (body: SessionUrlBatchRequest) =>
        request<SessionUrlBatchResponse>("/api/session-urls", {
          method: "POST",
          json: body,
        }),
      getSessionUrls: (sessionId: string) =>
        request<ListSessionUrlsResponse>("/api/session-urls", {
          query: { sessionId },
        }),

      // Sync
      syncBatch: (body: SyncBatchRequest) =>
        request<SyncBatchResponse>("/api/sync/batch", {
          method: "POST",
          json: body,
        }),

      // User session — Better Auth exposes this; returns null when no session.
      // Cast to MeResponse for consumer ergonomics; server returns
      // { user, session } | null.
      me: () => request<MeResponse | null>("/api/auth/get-session"),
    }
  }),
  dependencies: [StorageService.Default],
}) {}
