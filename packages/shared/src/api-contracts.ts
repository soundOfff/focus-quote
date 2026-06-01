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
  Tag,
  TagEdge,
  QuoteTag,
} from "./schema"
import type { AiFeature } from "./ai-features"

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

// ---- Tag graph (ADR 0003) ----

/** The full Tag-graph read-model for the signed-in user. */
export interface TagGraphResponse {
  tags: ReadonlyArray<Tag>
  edges: ReadonlyArray<TagEdge>
  memberships: ReadonlyArray<QuoteTag>
}

/** Summary of what a single Consolidation ("Tidy now") pass changed. */
export interface ConsolidateTagsResponse {
  ok: boolean
  changes: {
    merged: number
    renamed: number
    reparented: number
    deleted: number
    requotesRefiled: number
  }
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
  | "title"

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
  id: string
  name: string
  sessionCount: number
  completedCount: number
  totalActualMs: number
  lastUsedAt: string
}

export interface ListTopicsResponse {
  topics: ReadonlyArray<Topic>
}

export interface RenameTopicRequest {
  name: string
}

export interface RenameTopicResponse {
  topic: { id: string; name: string }
}

export type VaultItemKind = "note" | "url"

export interface VaultItem {
  id: string
  topicId: string
  kind: VaultItemKind
  body: string
  title: string | null
  createdAt: string
}

export interface ListVaultItemsResponse {
  items: ReadonlyArray<VaultItem>
}

export interface CreateVaultItemRequest {
  kind: VaultItemKind
  body: string
  title?: string | null
}

export interface CreateVaultItemResponse {
  item: VaultItem
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
  | { ok: true; deduped?: true }
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
  /**
   * The passage the user highlighted on the page. Empty/omitted in whole-page
   * mode, where `pageContent` carries the context instead. At least one of
   * `passage` / `pageContent` must be present.
   */
  passage?: string
  /**
   * Full-page text used when the user opens Quote+AI without highlighting
   * anything (whole-page mode). Captured by the content script.
   */
  pageContent?: string | null
  /** Source page URL (for context only, optional). */
  sourceUrl?: string | null
  /** Conversation history excluding the latest user turn. */
  history?: ReadonlyArray<QuoteAssistantTurn>
  /** The user's latest message. May be empty on the first call. */
  userMessage?: string
}

/** A suggested source the assistant offers so the user can go deeper. */
export interface QuoteAssistantSource {
  /** Short human-readable title for the link. */
  title: string
  /** Absolute http(s) URL. Server-validated to be reachable before returning. */
  url: string
  /** One short sentence on why the source is relevant. */
  snippet: string
}

export interface QuoteAssistantResponse {
  reply: string
  /** Suggested sources to visit. Absent/empty when none were warranted. */
  sources?: ReadonlyArray<QuoteAssistantSource>
}

/**
 * A single interactive control discovered on the current page, captured by the
 * extension and sent to the guide-steps endpoint so the model targets the REAL
 * elements on the page instead of guessing "typical web app" positions.
 *
 * Privacy: `label` is built only from accessible text (aria-label, visible text,
 * placeholder, title, alt). It never contains an element's *value*, and
 * password / hidden inputs are excluded entirely at capture time.
 */
export interface GuidePageElement {
  /** Dense index into the capture (0..n-1). The model echoes it as GuideStep.ref. */
  ref: number
  /** Accessible role or tag, e.g. "button", "link", "input:email". */
  role: string
  /** Accessible label, whitespace-collapsed and truncated. Never the value. */
  label: string
  /** Normalized viewport-fraction center at capture time. May fall outside
   *  0..1 when the element is off-screen (it is only a positional hint; the
   *  client re-measures the live element during playback). */
  x: number
  y: number
}

export interface GuidePageContext {
  /** document.title at capture time. */
  title: string
  /** Viewport size at capture time, in CSS px. */
  viewport: { w: number; h: number }
  /** Interactive elements discovered on the page, ranked by goal relevance. */
  elements: ReadonlyArray<GuidePageElement>
}

export interface GuideStepsRequest {
  /** Natural-language description of what the user wants to accomplish. */
  goal: string
  /** Current page URL (helps the model anchor its hints, optional). */
  sourceUrl?: string | null
  /** Snapshot of the page's real interactive elements (optional — when present
   *  the model points steps at actual controls; when absent it falls back to
   *  positional estimates). */
  pageContext?: GuidePageContext
}

export interface GuideStep {
  instruction: string
  /** Normalized viewport fraction (0..1). When `ref` is set this is the real
   *  element's center; otherwise it is the model's positional estimate. */
  x: number
  /** Normalized viewport fraction (0..1). */
  y: number
  description: string
  /** Index of the `GuidePageElement` this step points to, or null when the
   *  target is not among the captured elements. The extension re-measures this
   *  element's live position during playback. Optional for backwards
   *  compatibility with steps captured before this field existed. */
  ref?: number | null
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
  aiMasterEnabled?: boolean
  autoTitleEnabled?: boolean
  aiFeatureOverrides?: Partial<Record<AiFeature, boolean>>
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
