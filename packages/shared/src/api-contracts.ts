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
