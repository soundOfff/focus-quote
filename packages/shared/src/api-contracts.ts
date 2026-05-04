import type { Quote, NewQuote, Session, NewSession, SyncJob } from "./schema"

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
