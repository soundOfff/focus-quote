import type {
  Quote,
  NewQuote,
  Session,
  NewSession,
  SessionUrl,
  NewSessionUrl,
  SessionAction,
  NewSessionAction,
  MediaFile,
  UserMediaRef,
  SyncJob,
  UserSettings,
  UserProfile,
  UserPrivacy,
  SecretSummary,
  AiChatThread,
  AiChatThreadKind,
  AiChatMessage,
  AiChatRole,
  RecallAttempt,
  RecallVerdict,
  ToolbarRuntimeState,
} from "./schema"

// ---- Quotes ----

export interface ListQuotesQuery {
  limit?: number
  q?: string
}

export interface ListQuotesResponse {
  quotes: ReadonlyArray<Quote>
}

export interface SaveQuoteRequest extends NewQuote {}

export interface SaveQuoteResponse {
  quote: Quote
}

export interface DeleteQuoteResponse {
  ok: true
}

// ---- Sessions ----

export interface ListSessionsResponse {
  sessions: ReadonlyArray<Session>
}

export interface UpsertSessionRequest extends NewSession {
  id?: string
  completed?: boolean
  endedAt?: string | null
}

export interface UpsertSessionResponse {
  session: Session
}

export interface SessionSummaryResponse {
  summary: string | null
  pagesVisited: ReadonlyArray<{
    url: string
    title: string | null
    visitedAt: string
  }>
  actions: ReadonlyArray<{
    kind: string
    at: string
    payload: string
  }>
}

export interface SessionStudyTipsResponse {
  tips: ReadonlyArray<string> | null
}

export interface RecallQuestion {
  q: string
  a: string
}

export interface SessionRecallResponse {
  questions: ReadonlyArray<RecallQuestion> | null
}

export interface ResourceRecommendation {
  url: string
  title: string
  why: string
}

export interface SessionResourcesResponse {
  resources: ReadonlyArray<ResourceRecommendation> | null
}

export type RegenerateArtifact =
  | "summary"
  | "studyTips"
  | "recallQuestions"
  | "resourceRecommendations"
  | "topic"

export interface RegenerateRequest {
  artifact: RegenerateArtifact
}

export interface RegenerateResponse {
  ok: boolean
}

export interface RecallGradeRequest {
  questionIndex: number
  userAnswer: string
}

export interface RecallGradeResponse {
  verdict: RecallVerdict
  feedback: string
}

export interface Topic {
  name: string
  sessionCount: number
  completedCount: number
  totalActualMs: number
  lastUsedAt: string
}

export interface ListTopicsResponse {
  topics: ReadonlyArray<Topic>
}

// ---- Session URLs (AI analysis) ----

export interface SessionUrlBatchRequest {
  urls: ReadonlyArray<NewSessionUrl>
}

export interface SessionUrlBatchResponse {
  urls: ReadonlyArray<SessionUrl>
}

export interface ListSessionUrlsQuery {
  sessionId: string
}

export interface ListSessionUrlsResponse {
  urls: ReadonlyArray<SessionUrl>
}

export interface SessionActionBatchRequest {
  actions: ReadonlyArray<NewSessionAction>
}

export interface SessionActionBatchResponse {
  actions: ReadonlyArray<SessionAction>
}

export interface ListSessionActionsQuery {
  sessionId: string
}

export interface ListSessionActionsResponse {
  actions: ReadonlyArray<SessionAction>
}

export interface UploadMediaRequest {
  kind: "profile_photo" | "screenshot"
  mimeType: string
  dataBase64: string
  byteSize: number
  sessionId?: string | null
}

export interface UploadMediaResponse {
  file: MediaFile
  ref: UserMediaRef
}

export interface GetMediaResponse {
  file: MediaFile
  ref: UserMediaRef
}

export interface ListMediaQuery {
  kind?: "profile_photo" | "screenshot"
  sessionId?: string
  limit?: number
}

export interface ListMediaResponse {
  items: ReadonlyArray<{
    file: MediaFile
    ref: UserMediaRef
  }>
}

/** Event payloads streamed back over SSE during a session. */
export type SessionStreamEvent =
  | {
      type: "classification"
      sessionUrlId: string
      url: string
      category: string
      distractionScore: number
    }
  | {
      type: "nudge"
      sessionUrlId: string
      message: string
    }
  | {
      type: "summary"
      sessionId: string
      summary: string
    }
  | { type: "ping" }

// ---- Sync ----

export interface SyncBatchRequest {
  jobs: ReadonlyArray<SyncJob>
}

export type SyncBatchItemResult =
  | { ok: true }
  | { ok: false; error: string }

export interface SyncBatchResponse {
  results: ReadonlyArray<SyncBatchItemResult>
}

// ---- User / auth ----

export interface User {
  id: string
  email: string
  name: string | null
  image: string | null
}

export interface MeResponse {
  user: User
}

// ---- Toolbar AI (Quote+AI + Guide Me) ----

export type QuoteAssistantRole = "user" | "assistant"

export interface QuoteAssistantTurn {
  role: QuoteAssistantRole
  content: string
}

export interface QuoteAssistantRequest {
  /** The passage the user highlighted on the page. Required. */
  passage: string
  /** Source page URL (for context only, optional). */
  sourceUrl?: string | null
  /** Conversation history excluding the latest user turn. */
  history?: ReadonlyArray<QuoteAssistantTurn>
  /** The user's latest message. May be empty on the first call. */
  userMessage?: string
}

export interface QuoteAssistantResponse {
  reply: string
}

export interface GuideStepsRequest {
  /** Natural-language description of what the user wants to accomplish. */
  goal: string
  /** Current page URL (helps the model anchor its hints, optional). */
  sourceUrl?: string | null
}

export interface GuideStep {
  instruction: string
  /** Normalized viewport fraction (0..1). */
  x: number
  /** Normalized viewport fraction (0..1). */
  y: number
  description: string
}

export interface GuideStepsResponse {
  steps: ReadonlyArray<GuideStep>
}

// ---- Remote-first user state ----

export interface GetUserSettingsResponse {
  settings: UserSettings
}

export interface UpdateUserSettingsRequest {
  theme: UserSettings["theme"]
  defaultDurationMinutes: number
  defaultBreakMinutes: number
  translateFromLang: string
  translateToLang: string
  todayGoal?: string | null
  debugOverlayEnabled?: boolean
  notificationsBlocked?: boolean
  toolbarSide?: "left" | "right"
}

export interface UpdateUserSettingsResponse {
  settings: UserSettings
}

export interface GetUserProfileResponse {
  profile: UserProfile
}

export interface UpdateUserProfileRequest {
  displayName: string
  headline: string
  photoMediaFileId?: string | null
}

export interface UpdateUserProfileResponse {
  profile: UserProfile
}

export interface GetUserPrivacyResponse {
  privacy: UserPrivacy
}

export interface UpdateUserPrivacyRequest {
  trackUrls: boolean
  blocklist: ReadonlyArray<string>
}

export interface UpdateUserPrivacyResponse {
  privacy: UserPrivacy
}

export interface GetSecretResponse {
  secret: SecretSummary
}

export interface PutSecretRequest {
  value: string
}

export interface PutSecretResponse {
  secret: SecretSummary
}

export interface DeleteSecretResponse {
  ok: true
}

export interface ListAiThreadsQuery {
  kind?: AiChatThreadKind
  limit?: number
}

export interface ListAiThreadsResponse {
  threads: ReadonlyArray<AiChatThread>
}

export interface CreateAiThreadRequest {
  id?: string
  kind: AiChatThreadKind
  passage?: string | null
  sourceUrl?: string | null
  goal?: string | null
}

export interface CreateAiThreadResponse {
  thread: AiChatThread
}

export interface ListAiMessagesResponse {
  messages: ReadonlyArray<AiChatMessage>
}

export interface AppendAiMessageRequest {
  role: AiChatRole
  content: string
}

export interface AppendAiMessageResponse {
  message: AiChatMessage
}

export interface ListRecallAttemptsQuery {
  sessionId: string
}

export interface ListRecallAttemptsResponse {
  attempts: ReadonlyArray<RecallAttempt>
}

export interface GetToolbarStateResponse {
  state: ToolbarRuntimeState | null
}

export interface PutToolbarStateRequest {
  payload: string
}

export interface PutToolbarStateResponse {
  state: ToolbarRuntimeState
}

// ---- Errors ----

export interface ApiErrorResponse {
  error: string
  code?: string
}
