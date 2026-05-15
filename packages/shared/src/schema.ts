import { Schema } from "effect"

export const QuoteId = Schema.String.pipe(Schema.brand("QuoteId"))
export type QuoteId = Schema.Schema.Type<typeof QuoteId>

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"))
export type SessionId = Schema.Schema.Type<typeof SessionId>

export const SessionUrlId = Schema.String.pipe(Schema.brand("SessionUrlId"))
export type SessionUrlId = Schema.Schema.Type<typeof SessionUrlId>

export const SessionActionId = Schema.String.pipe(Schema.brand("SessionActionId"))
export type SessionActionId = Schema.Schema.Type<typeof SessionActionId>

export const MediaFileId = Schema.String.pipe(Schema.brand("MediaFileId"))
export type MediaFileId = Schema.Schema.Type<typeof MediaFileId>

export const UserMediaRefId = Schema.String.pipe(Schema.brand("UserMediaRefId"))
export type UserMediaRefId = Schema.Schema.Type<typeof UserMediaRefId>

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

export const MediaKind = Schema.Literal("profile_photo", "screenshot")
export type MediaKind = Schema.Schema.Type<typeof MediaKind>

export const MediaFile = Schema.Struct({
  id: MediaFileId,
  mimeType: Schema.String,
  dataBase64: Schema.String,
  byteSize: Schema.Number,
  createdAt: Schema.String,
})
export type MediaFile = Schema.Schema.Type<typeof MediaFile>

export const NewMediaFile = Schema.Struct({
  id: MediaFileId,
  mimeType: Schema.String,
  dataBase64: Schema.String,
  byteSize: Schema.Number,
})
export type NewMediaFile = Schema.Schema.Type<typeof NewMediaFile>

export const UserMediaRef = Schema.Struct({
  id: UserMediaRefId,
  userId: Schema.String,
  fileId: MediaFileId,
  kind: MediaKind,
  sessionId: NullableString,
  createdAt: Schema.String,
})
export type UserMediaRef = Schema.Schema.Type<typeof UserMediaRef>

export const NewUserMediaRef = Schema.Struct({
  id: UserMediaRefId,
  fileId: MediaFileId,
  kind: MediaKind,
  sessionId: NullableString,
})
export type NewUserMediaRef = Schema.Schema.Type<typeof NewUserMediaRef>

export const Theme = Schema.Literal("dark", "light")
export type Theme = Schema.Schema.Type<typeof Theme>

export const Settings = Schema.Struct({
  openrouterApiKey: Schema.optional(Schema.String),
  theme: Schema.optionalWith(Theme, { default: () => "dark" as const }),
  todayGoal: Schema.optional(Schema.String),
})
export type Settings = Schema.Schema.Type<typeof Settings>

/**
 * Cross-device user settings (server source of truth). Mirrors the wire
 * payload from `/api/settings`. Optional UI fields (debug overlay, toolbar
 * side, notifications block) are best-effort hints for the extension UI.
 */
export const UserSettings = Schema.Struct({
  theme: Theme,
  defaultDurationMinutes: Schema.Number,
  defaultBreakMinutes: Schema.Number,
  translateFromLang: Schema.String,
  translateToLang: Schema.String,
  todayGoal: NullableString,
  debugOverlayEnabled: Schema.Boolean,
  notificationsBlocked: Schema.Boolean,
  toolbarSide: Schema.Literal("left", "right"),
  updatedAt: Schema.String,
})
export type UserSettings = Schema.Schema.Type<typeof UserSettings>

export const UserProfile = Schema.Struct({
  displayName: Schema.String,
  headline: Schema.String,
  photoMediaFileId: NullableString,
  updatedAt: Schema.String,
})
export type UserProfile = Schema.Schema.Type<typeof UserProfile>

export const UserPrivacy = Schema.Struct({
  trackUrls: Schema.Boolean,
  blocklist: Schema.Array(Schema.String),
  updatedAt: Schema.String,
})
export type UserPrivacy = Schema.Schema.Type<typeof UserPrivacy>

export const SecretKind = Schema.Literal("openrouter")
export type SecretKind = Schema.Schema.Type<typeof SecretKind>

export const SecretSummary = Schema.Struct({
  kind: SecretKind,
  hasValue: Schema.Boolean,
  hint: NullableString,
  updatedAt: NullableString,
})
export type SecretSummary = Schema.Schema.Type<typeof SecretSummary>

export const AiChatThreadKind = Schema.Literal("quote_assistant", "guide_me")
export type AiChatThreadKind = Schema.Schema.Type<typeof AiChatThreadKind>

export const AiChatRole = Schema.Literal("user", "assistant")
export type AiChatRole = Schema.Schema.Type<typeof AiChatRole>

export const AiChatMessage = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  role: AiChatRole,
  content: Schema.String,
  createdAt: Schema.String,
})
export type AiChatMessage = Schema.Schema.Type<typeof AiChatMessage>

export const AiChatThread = Schema.Struct({
  id: Schema.String,
  kind: AiChatThreadKind,
  passage: NullableString,
  sourceUrl: NullableString,
  goal: NullableString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type AiChatThread = Schema.Schema.Type<typeof AiChatThread>

export const RecallVerdict = Schema.Literal("correct", "partial", "incorrect")
export type RecallVerdict = Schema.Schema.Type<typeof RecallVerdict>

export const RecallAttempt = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  questionIndex: Schema.Number,
  userAnswer: Schema.String,
  verdict: RecallVerdict,
  feedback: Schema.String,
  gradedAt: Schema.String,
})
export type RecallAttempt = Schema.Schema.Type<typeof RecallAttempt>

export const ToolbarRuntimeState = Schema.Struct({
  name: Schema.String,
  payload: Schema.String,
  updatedAt: Schema.String,
})
export type ToolbarRuntimeState = Schema.Schema.Type<typeof ToolbarRuntimeState>

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
