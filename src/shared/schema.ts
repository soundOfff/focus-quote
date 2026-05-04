import { Schema } from "effect"

export const DeviceId = Schema.String.pipe(Schema.brand("DeviceId"))
export type DeviceId = Schema.Schema.Type<typeof DeviceId>

export const QuoteId = Schema.String.pipe(Schema.brand("QuoteId"))
export type QuoteId = Schema.Schema.Type<typeof QuoteId>

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"))
export type SessionId = Schema.Schema.Type<typeof SessionId>

const NullableString = Schema.NullOr(Schema.String)

export const Quote = Schema.Struct({
  id: QuoteId,
  deviceId: DeviceId,
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
  deviceId: DeviceId,
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

export const Theme = Schema.Literal("dark", "light")
export type Theme = Schema.Schema.Type<typeof Theme>

export const Settings = Schema.Struct({
  openrouterApiKey: Schema.optional(Schema.String),
  theme: Schema.optionalWith(Theme, { default: () => "dark" as const }),
  todayGoal: Schema.optional(Schema.String),
})
export type Settings = Schema.Schema.Type<typeof Settings>

export const SyncJob = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("upsertQuote"),
    quote: Quote,
  }),
  Schema.Struct({
    kind: Schema.Literal("deleteQuote"),
    id: QuoteId,
    deviceId: DeviceId,
  }),
  Schema.Struct({
    kind: Schema.Literal("upsertSession"),
    session: Session,
  }),
)
export type SyncJob = Schema.Schema.Type<typeof SyncJob>
