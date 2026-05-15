import { Schema } from "effect"

export const QuoteId = Schema.String.pipe(Schema.brand("QuoteId"))
export type QuoteId = Schema.Schema.Type<typeof QuoteId>

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"))
export type SessionId = Schema.Schema.Type<typeof SessionId>

export const SessionUrlId = Schema.String.pipe(Schema.brand("SessionUrlId"))
export type SessionUrlId = Schema.Schema.Type<typeof SessionUrlId>

export const SessionActionId = Schema.String.pipe(Schema.brand("SessionActionId"))
export type SessionActionId = Schema.Schema.Type<typeof SessionActionId>

const NullableString = Schema.NullOr(Schema.String)

export const Quote = Schema.Struct({
  id: QuoteId,
  text: Schema.String.pipe(Schema.minLength(1)),
  sourceUrl: NullableString,
  sourceTitle: NullableString,
  tag: NullableString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Quote = Schema.Schema.Type<typeof Quote>

export const NewQuote = Schema.Struct({
  text: Schema.String.pipe(Schema.minLength(1)),
  sourceUrl: NullableString,
  sourceTitle: NullableString,
  tag: NullableString,
})
export type NewQuote = Schema.Schema.Type<typeof NewQuote>

export const Session = Schema.Struct({
  id: SessionId,
  goal: NullableString,
  durationMinutes: Schema.Number,
  breakMinutes: Schema.Number,
  completed: Schema.Boolean,
  startedAt: Schema.String,
  endedAt: NullableString,
})
export type Session = Schema.Schema.Type<typeof Session>

export const NewSession = Schema.Struct({
  goal: NullableString,
  durationMinutes: Schema.Number.pipe(Schema.positive()),
  breakMinutes: Schema.Number.pipe(Schema.nonNegative()),
})
export type NewSession = Schema.Schema.Type<typeof NewSession>

export const SessionUrl = Schema.Struct({
  id: SessionUrlId,
  sessionId: SessionId,
  url: Schema.String,
  hostname: Schema.String,
  title: NullableString,
  content: NullableString,
  visitedAt: Schema.String,
  category: NullableString,
  distractionScore: Schema.NullOr(Schema.Number),
  summary: NullableString,
})
export type SessionUrl = Schema.Schema.Type<typeof SessionUrl>

export const NewSessionUrl = Schema.Struct({
  id: SessionUrlId,
  sessionId: SessionId,
  url: Schema.String.pipe(Schema.minLength(1)),
  hostname: Schema.String.pipe(Schema.minLength(1)),
  title: NullableString,
  content: NullableString,
  visitedAt: Schema.String,
})
export type NewSessionUrl = Schema.Schema.Type<typeof NewSessionUrl>

export const SessionActionKind = Schema.Literal(
  "click",
  "focus",
  "blur",
  "submit",
  "scroll",
  "nav",
)
export type SessionActionKind = Schema.Schema.Type<typeof SessionActionKind>

export const SessionAction = Schema.Struct({
  id: SessionActionId,
  sessionId: SessionId,
  kind: SessionActionKind,
  payload: Schema.String,
  at: Schema.String,
})
export type SessionAction = Schema.Schema.Type<typeof SessionAction>

export const NewSessionAction = Schema.Struct({
  id: SessionActionId,
  sessionId: SessionId,
  kind: SessionActionKind,
  payload: Schema.String,
  at: Schema.String,
})
export type NewSessionAction = Schema.Schema.Type<typeof NewSessionAction>

export const Theme = Schema.Literal("dark", "light")
export type Theme = Schema.Schema.Type<typeof Theme>

export const Settings = Schema.Struct({
  openrouterApiKey: Schema.optional(Schema.String),
  theme: Schema.optionalWith(Theme, { default: () => "dark" as const }),
  todayGoal: Schema.optional(Schema.String),
})
export type Settings = Schema.Schema.Type<typeof Settings>

/**
 * SyncJob is the wire format for queued offline mutations posted to
 * the server's /api/sync/batch endpoint. The server resolves the
 * acting user from the bearer-auth session, so jobs carry no
 * device/user id.
 */
export const SyncJob = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("upsertQuote"),
    id: QuoteId,
    text: Schema.String,
    sourceUrl: NullableString,
    sourceTitle: NullableString,
    tag: NullableString,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("deleteQuote"),
    id: QuoteId,
  }),
  Schema.Struct({
    kind: Schema.Literal("upsertSession"),
    id: SessionId,
    goal: NullableString,
    durationMinutes: Schema.Number,
    breakMinutes: Schema.Number,
    completed: Schema.Boolean,
    startedAt: Schema.String,
    endedAt: NullableString,
  }),
  Schema.Struct({
    kind: Schema.Literal("upsertSessionUrl"),
    id: SessionUrlId,
    sessionId: SessionId,
    url: Schema.String,
    hostname: Schema.String,
    title: NullableString,
    content: NullableString,
    visitedAt: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("upsertSessionAction"),
    id: SessionActionId,
    sessionId: SessionId,
    actionKind: SessionActionKind,
    payload: Schema.String,
    at: Schema.String,
  }),
)
export type SyncJob = Schema.Schema.Type<typeof SyncJob>
