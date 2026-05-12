import type {
  Quote,
  NewQuote,
  Session,
  NewSession,
  SessionUrl,
  NewSessionUrl,
  SyncJob,
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

export type RecallVerdict = "correct" | "partial" | "incorrect"

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

// ---- Errors ----

export interface ApiErrorResponse {
  error: string
  code?: string
}
