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
  SessionActionBatchRequest,
  SessionActionBatchResponse,
  UploadMediaRequest,
  UploadMediaResponse,
  GetMediaResponse,
  ListMediaResponse,
  SessionSummaryResponse,
  SessionStudyTipsResponse,
  SessionRecallResponse,
  SessionResourcesResponse,
  RegenerateRequest,
  RegenerateResponse,
  RecallGradeRequest,
  RecallGradeResponse,
  ListTopicsResponse,
  RenameTopicResponse,
  CreateTopicResponse,
  DeleteTopicResponse,
  TagGraphResponse,
  ConsolidateChanges,
  ConsolidateProgressEvent,
  ListVaultItemsResponse,
  CreateVaultItemRequest,
  CreateVaultItemResponse,
  ListPendingVaultItemsResponse,
  SaveSessionVaultLinkResponse,
  SaveVaultItemRequest,
  SaveVaultItemResponse,
  MoveVaultItemResponse,
  AssignSessionTopicResponse,
  SyncBatchRequest,
  SyncBatchResponse,
  MeResponse,
  QuoteAssistantRequest,
  QuoteAssistantResponse,
  GuideStepsRequest,
  GuideStepsResponse,
  GetUserSettingsResponse,
  UpdateUserSettingsRequest,
  UpdateUserSettingsResponse,
  GetUserProfileResponse,
  UpdateUserProfileRequest,
  UpdateUserProfileResponse,
  GetUserPrivacyResponse,
  UpdateUserPrivacyRequest,
  UpdateUserPrivacyResponse,
  GetSecretResponse,
  PutSecretRequest,
  PutSecretResponse,
  DeleteSecretResponse,
  ListAiThreadsResponse,
  CreateAiThreadRequest,
  CreateAiThreadResponse,
  ListAiMessagesResponse,
  AppendAiMessageRequest,
  AppendAiMessageResponse,
  ListRecallAttemptsResponse,
  GetToolbarStateResponse,
  PutToolbarStateRequest,
  PutToolbarStateResponse,
  AiChatThreadKind,
} from "@focus-quote/shared"

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PUT" | "PATCH"
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

/**
 * Reads the SSE body of POST /api/tags/consolidate: split on blank-line frame
 * delimiters, parse each frame's `data:` payload, forward non-terminal frames
 * to `onProgress`, and return the terminal `done` frame's changes (or null if
 * the stream ended without one). Mirrors the framing in realtimeStream.ts.
 */
const drainConsolidateStream = async (
  body: ReadableStream<Uint8Array>,
  onProgress: (event: ConsolidateProgressEvent) => void,
): Promise<ConsolidateChanges | null> => {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  let result: ConsolidateChanges | null = null
  const handleFrame = (block: string) => {
    let data = ""
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) data += line.slice(5).trimStart() + "\n"
    }
    const trimmed = data.trim()
    if (!trimmed) return
    let event: ConsolidateProgressEvent
    try {
      event = JSON.parse(trimmed) as ConsolidateProgressEvent
    } catch {
      return
    }
    if (event.phase === "done") result = event.changes
    else onProgress(event)
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = pending.indexOf("\n\n")) !== -1) {
      handleFrame(pending.slice(0, idx))
      pending = pending.slice(idx + 2)
    }
  }
  pending += decoder.decode()
  if (pending.trim()) handleFrame(pending)
  return result
}

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
      getSessionSummary: (sessionId: string) =>
        request<SessionSummaryResponse>(
          `/api/focus-sessions/${sessionId}/summary`,
        ),
      getStudyTips: (sessionId: string) =>
        request<SessionStudyTipsResponse>(
          `/api/focus-sessions/${sessionId}/study-tips`,
        ),
      getRecallQuestions: (sessionId: string) =>
        request<SessionRecallResponse>(
          `/api/focus-sessions/${sessionId}/recall`,
        ),
      getResourceRecommendations: (sessionId: string) =>
        request<SessionResourcesResponse>(
          `/api/focus-sessions/${sessionId}/resources`,
        ),
      attachSessionVaultLink: (
        sessionId: string,
        body: { url: string; title?: string | null },
      ) =>
        request<SaveSessionVaultLinkResponse>(
          `/api/focus-sessions/${sessionId}/vault-link`,
          { method: "POST", json: body },
        ),
      // Pending vault items saved during a session before it has a topic.
      listSessionVaultPending: (sessionId: string) =>
        request<ListPendingVaultItemsResponse>(
          `/api/focus-sessions/${sessionId}/vault-pending`,
        ),
      // Manually assign a session to an existing topic (promotes pending items).
      assignSessionTopic: (sessionId: string, topicId: string) =>
        request<AssignSessionTopicResponse>(
          `/api/focus-sessions/${sessionId}/topic`,
          { method: "POST", json: { topicId } },
        ),
      // General quick-save (images): session-scoped when sessionId is set, else
      // filed under "Uncategorized".
      saveVaultItem: (body: SaveVaultItemRequest) =>
        request<SaveVaultItemResponse>("/api/vault/save", {
          method: "POST",
          json: body,
        }),
      regenerateArtifact: (sessionId: string, body: RegenerateRequest) =>
        request<RegenerateResponse>(
          `/api/focus-sessions/${sessionId}/regenerate`,
          { method: "POST", json: body },
        ),
      gradeRecallAnswer: (sessionId: string, body: RecallGradeRequest) =>
        request<RecallGradeResponse>(
          `/api/focus-sessions/${sessionId}/recall/grade`,
          { method: "POST", json: body },
        ),
      listTopics: () => request<ListTopicsResponse>("/api/topics"),
      createTopic: (name: string) =>
        request<CreateTopicResponse>("/api/topics", {
          method: "POST",
          json: { name },
        }),
      renameTopic: (id: string, name: string) =>
        request<RenameTopicResponse>(`/api/topics/${encodeURIComponent(id)}`, {
          method: "PATCH",
          json: { name },
        }),
      deleteTopic: (id: string) =>
        request<DeleteTopicResponse>(`/api/topics/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      listTopicMedia: (label: string) =>
        request<{
          items: Array<{
            id: string
            topic: string
            fileId: string
            note: string | null
            createdAt: string
            mimeType: string
            dataBase64: string
            byteSize: number
          }>
        }>(`/api/topics/${encodeURIComponent(label)}/media`),
      attachTopicMedia: (
        label: string,
        body: { fileId: string; note?: string | null },
      ) =>
        request<{ ok: boolean; id: string }>(
          `/api/topics/${encodeURIComponent(label)}/media`,
          { method: "POST", json: body },
        ),
      deleteTopicMedia: (label: string, mediaId: string) =>
        request<{ ok: boolean }>(
          `/api/topics/${encodeURIComponent(label)}/media/${mediaId}`,
          { method: "DELETE" },
        ),
      listTopicVault: (topicId: string) =>
        request<ListVaultItemsResponse>(
          `/api/topics/${encodeURIComponent(topicId)}/vault`,
        ),
      addTopicVaultItem: (topicId: string, body: CreateVaultItemRequest) =>
        request<CreateVaultItemResponse>(
          `/api/topics/${encodeURIComponent(topicId)}/vault`,
          { method: "POST", json: body },
        ),
      deleteTopicVaultItem: (topicId: string, itemId: string) =>
        request<{ ok: boolean }>(
          `/api/topics/${encodeURIComponent(topicId)}/vault/${itemId}`,
          { method: "DELETE" },
        ),
      // Move a committed vault item from one topic to another.
      moveTopicVaultItem: (
        topicId: string,
        itemId: string,
        targetTopicId: string,
      ) =>
        request<MoveVaultItemResponse>(
          `/api/topics/${encodeURIComponent(topicId)}/vault/${itemId}`,
          { method: "PATCH", json: { topicId: targetTopicId } },
        ),

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
      postSessionActions: (body: SessionActionBatchRequest) =>
        request<SessionActionBatchResponse>("/api/session-actions", {
          method: "POST",
          json: body,
        }),
      uploadMedia: (body: UploadMediaRequest) =>
        request<UploadMediaResponse>("/api/media", {
          method: "POST",
          json: body,
        }),
      getMedia: (id: string) => request<GetMediaResponse>(`/api/media/${id}`),
      listMedia: (query?: {
        kind?: "profile_photo" | "screenshot"
        sessionId?: string
        limit?: number
      }) => request<ListMediaResponse>("/api/media", { query }),

      // Tag graph (ADR 0003)
      getTagGraph: () => request<TagGraphResponse>("/api/tags/graph"),
      // Streamed "Tidy now": POST that emits SSE progress frames. We read it via
      // fetch + ReadableStream (EventSource can neither POST nor send the auth
      // header), forward each step to `onProgress`, and resolve with the final
      // `done` frame's change tally. No auto-retry — the pass has side effects,
      // so a half-applied run must not silently replay.
      consolidateTagsStream: (
        onProgress: (event: ConsolidateProgressEvent) => void,
      ): Effect.Effect<ConsolidateChanges, NetworkError | SignedOutError> =>
        Effect.gen(function* () {
          const token = yield* storage
            .get<string>(AUTH_TOKEN_KEY)
            .pipe(Effect.catchAll(() => Effect.succeed(null)))
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          }
          if (token) headers.Authorization = `Bearer ${token}`

          const res = yield* Effect.tryPromise({
            try: () =>
              fetch(buildUrl("/api/tags/consolidate"), {
                method: "POST",
                headers,
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
          if (!res.ok || !res.body) {
            return yield* Effect.fail(
              new NetworkError({
                message: `HTTP ${res.status}`,
                status: res.status,
              }),
            )
          }

          const changes = yield* Effect.tryPromise({
            try: () => drainConsolidateStream(res.body as ReadableStream<Uint8Array>, onProgress),
            catch: (cause) =>
              new NetworkError({ message: "stream read failed", cause }),
          })
          if (!changes) {
            return yield* Effect.fail(
              new NetworkError({
                message: "tidy stream ended without a result",
              }),
            )
          }
          return changes
        }),

      // Sync
      syncBatch: (body: SyncBatchRequest) =>
        request<SyncBatchResponse>("/api/sync/batch", {
          method: "POST",
          json: body,
        }),

      // Toolbar AI (Quote+AI + Guide Me). Mirrored here for parity with
      // the content-script flat-fetch helper; popup/newtab can call these
      // through the standard Effect-based pipeline.
      quoteAssistant: (body: QuoteAssistantRequest) =>
        request<QuoteAssistantResponse>("/api/ai/quote-assistant", {
          method: "POST",
          json: body,
        }),
      guideSteps: (body: GuideStepsRequest) =>
        request<GuideStepsResponse>("/api/ai/guide-steps", {
          method: "POST",
          json: body,
        }),

      // User session — Better Auth exposes this; returns null when no session.
      // Cast to MeResponse for consumer ergonomics; server returns
      // { user, session } | null.
      me: () => request<MeResponse | null>("/api/auth/get-session"),

      // Remote-first user state (settings/profile/privacy/secrets/etc.)
      getSettings: () => request<GetUserSettingsResponse>("/api/settings"),
      putSettings: (body: UpdateUserSettingsRequest) =>
        request<UpdateUserSettingsResponse>("/api/settings", {
          method: "PUT",
          json: body,
        }),
      getProfile: () => request<GetUserProfileResponse>("/api/profile"),
      putProfile: (body: UpdateUserProfileRequest) =>
        request<UpdateUserProfileResponse>("/api/profile", {
          method: "PUT",
          json: body,
        }),
      getPrivacy: () => request<GetUserPrivacyResponse>("/api/privacy"),
      putPrivacy: (body: UpdateUserPrivacyRequest) =>
        request<UpdateUserPrivacyResponse>("/api/privacy", {
          method: "PUT",
          json: body,
        }),
      getSecret: (kind: "openrouter") =>
        request<GetSecretResponse>(`/api/secrets/${kind}`),
      putSecret: (kind: "openrouter", body: PutSecretRequest) =>
        request<PutSecretResponse>(`/api/secrets/${kind}`, {
          method: "PUT",
          json: body,
        }),
      deleteSecret: (kind: "openrouter") =>
        request<DeleteSecretResponse>(`/api/secrets/${kind}`, {
          method: "DELETE",
        }),
      listAiThreads: (query?: { kind?: AiChatThreadKind; limit?: number }) =>
        request<ListAiThreadsResponse>("/api/ai-history/threads", { query }),
      createAiThread: (body: CreateAiThreadRequest) =>
        request<CreateAiThreadResponse>("/api/ai-history/threads", {
          method: "POST",
          json: body,
        }),
      listAiMessages: (threadId: string) =>
        request<ListAiMessagesResponse>(
          `/api/ai-history/threads/${threadId}/messages`,
        ),
      appendAiMessage: (threadId: string, body: AppendAiMessageRequest) =>
        request<AppendAiMessageResponse>(
          `/api/ai-history/threads/${threadId}/messages`,
          { method: "POST", json: body },
        ),
      listRecallAttempts: (sessionId: string) =>
        request<ListRecallAttemptsResponse>("/api/recall/attempts", {
          query: { sessionId },
        }),
      getToolbarState: (name: string) =>
        request<GetToolbarStateResponse>(`/api/toolbar-state/${name}`),
      putToolbarState: (name: string, body: PutToolbarStateRequest) =>
        request<PutToolbarStateResponse>(`/api/toolbar-state/${name}`, {
          method: "PUT",
          json: body,
        }),
    }
  }),
  dependencies: [StorageService.Default],
}) {}
