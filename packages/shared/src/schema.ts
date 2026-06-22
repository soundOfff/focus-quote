import { Schema } from "effect"

export const QuoteId = Schema.String.pipe(Schema.brand("QuoteId"))
export type QuoteId = Schema.Schema.Type<typeof QuoteId>

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"))
export type SessionId = Schema.Schema.Type<typeof SessionId>

export const TopicId = Schema.String.pipe(Schema.brand("TopicId"))
export type TopicId = Schema.Schema.Type<typeof TopicId>

export const TagId = Schema.String.pipe(Schema.brand("TagId"))
export type TagId = Schema.Schema.Type<typeof TagId>

export const SessionUrlId = Schema.String.pipe(Schema.brand("SessionUrlId"))
export type SessionUrlId = Schema.Schema.Type<typeof SessionUrlId>

export const SessionActionId = Schema.String.pipe(Schema.brand("SessionActionId"))
export type SessionActionId = Schema.Schema.Type<typeof SessionActionId>

export const MediaFileId = Schema.String.pipe(Schema.brand("MediaFileId"))
export type MediaFileId = Schema.Schema.Type<typeof MediaFileId>

export const UserMediaRefId = Schema.String.pipe(Schema.brand("UserMediaRefId"))
export type UserMediaRefId = Schema.Schema.Type<typeof UserMediaRefId>

const NullableString = Schema.NullOr(Schema.String)

const ContentHash = Schema.String.pipe(Schema.length(64))

/**
 * A Quote's place in the AI-maintained Tag graph (ADR 0003). "pending" means
 * the server-side categorizer hasn't filed it yet (offline-first capture is
 * always pending until the per-Save Haiku pass runs); "categorized" means it
 * carries at least one Tag. Membership lives in the Tag graph read-model
 * (`QuoteTag`), never on the Quote — this is just the filing-state flag.
 */
export const CategorizationStatus = Schema.Literal("pending", "categorized")
export type CategorizationStatus = Schema.Schema.Type<typeof CategorizationStatus>

export const Quote = Schema.Struct({
  id: QuoteId,
  text: Schema.String.pipe(Schema.minLength(1)),
  sourceUrl: NullableString,
  sourceTitle: NullableString,
  contentHash: ContentHash,
  // Optional-with-default so older locally-stored records (no field) decode.
  categorizationStatus: Schema.optionalWith(CategorizationStatus, {
    default: () => "pending" as const,
  }),
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Quote = Schema.Schema.Type<typeof Quote>

export const NewQuote = Schema.Struct({
  text: Schema.String.pipe(Schema.minLength(1)),
  sourceUrl: NullableString,
  sourceTitle: NullableString,
})
export type NewQuote = Schema.Schema.Type<typeof NewQuote>

// ---- Tag graph (ADR 0003) ----
// Tags are subjects in a directed acyclic graph: a Tag may have several parent
// Tags (via TagEdge) and a Quote may carry several Tags (via QuoteTag). Identity
// is the stable `id`; `name` is a mutable attribute the AI may rename or merge.
// `userEdited` pins a Tag / edge / membership so the autonomous curator never
// overrides it.

export const Tag = Schema.Struct({
  id: TagId,
  name: Schema.String.pipe(Schema.minLength(1)),
  userEdited: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Tag = Schema.Schema.Type<typeof Tag>

/** A directed parent → child edge between two Tags. */
export const TagEdge = Schema.Struct({
  parentId: TagId,
  childId: TagId,
  userEdited: Schema.Boolean,
})
export type TagEdge = Schema.Schema.Type<typeof TagEdge>

/** A Quote's membership in a Tag. `userEdited` = pinned by manual tagging. */
export const QuoteTag = Schema.Struct({
  quoteId: QuoteId,
  tagId: TagId,
  userEdited: Schema.Boolean,
})
export type QuoteTag = Schema.Schema.Type<typeof QuoteTag>

/** The whole synced read-model the extension keeps so the tree renders offline. */
export const TagGraph = Schema.Struct({
  tags: Schema.Array(Tag),
  edges: Schema.Array(TagEdge),
  memberships: Schema.Array(QuoteTag),
})
export type TagGraph = Schema.Schema.Type<typeof TagGraph>

export const Session = Schema.Struct({
  id: SessionId,
  goal: NullableString,
  // AI-generated label (issue #9). Server-provided; absent on locally-created
  // sessions, so the key is optional (undefined until the server fills it).
  title: Schema.optional(NullableString),
  // The session's resolved Topic (issue #34). `topicId` is the stable identity
  // (ADR-0001); `topic` is the mutable display label. Both are server-provided
  // and optional — absent on locally-created sessions, null until resolved.
  topic: Schema.optional(NullableString),
  topicId: Schema.optional(Schema.NullOr(TopicId)),
  durationMinutes: Schema.Number,
  breakMinutes: Schema.Number,
  completed: Schema.Boolean,
  startedAt: Schema.String,
  endedAt: NullableString,
})
export type Session = Schema.Schema.Type<typeof Session>

export const NewSession = Schema.Struct({
  // The session's human-authored label, now required at start (no AI auto-title).
  // Stored in the `goal` column for backwards compatibility; surfaced in the UI
  // as the session "title".
  goal: Schema.String.pipe(Schema.minLength(1)),
  // The Topic ("vault") the session is filed under. Chosen manually at start —
  // the AI no longer classifies sessions into topics (the user picks one, or
  // creates one, in the popup before the timer runs).
  topicId: TopicId,
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
  aiMasterEnabled: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
  // Opt-in auto-title generator toggle (issue #9). Default off.
  autoTitleEnabled: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  // Per-feature AI overrides (issue #5). Absent feature falls back to its tier
  // default; merged into the gate's featureOverrides. Keyed by AiFeature.
  aiFeatureOverrides: Schema.optionalWith(
    Schema.Record({ key: Schema.String, value: Schema.Boolean }),
    { default: () => ({}) },
  ),
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
    contentHash: ContentHash,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("deleteQuote"),
    id: QuoteId,
  }),
  // ---- Tag graph mutations (ADR 0003) ----
  // Manual tag ops are pinned (userEdited) server-side so the autonomous
  // curator never overrides them. Tag ids are client-generated (like quote /
  // session ids); the tags table has no unique(name) constraint, so near-dupes
  // are tolerated and reconciled by Consolidation rather than colliding.
  Schema.Struct({
    kind: Schema.Literal("upsertTag"),
    id: TagId,
    name: Schema.String,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("deleteTag"),
    id: TagId,
  }),
  Schema.Struct({
    kind: Schema.Literal("attachQuoteTag"),
    quoteId: QuoteId,
    tagId: TagId,
    createdAt: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("detachQuoteTag"),
    quoteId: QuoteId,
    tagId: TagId,
  }),
  Schema.Struct({
    kind: Schema.Literal("upsertSession"),
    id: SessionId,
    goal: NullableString,
    // The chosen Topic. Optional+nullable on the wire so a re-sent completion
    // upsert and any pre-existing queued job (enqueued before topics became
    // required) still decode; the server resolves + ownership-checks it.
    topicId: Schema.optional(Schema.NullOr(TopicId)),
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
  // A persistent Quote+AI Conversation, drained into ai_chat_threads. The id is
  // derived deterministically from the article URL so every device converges on
  // one thread per article. `passage` carries the latest highlight as context.
  Schema.Struct({
    kind: Schema.Literal("upsertChatThread"),
    id: Schema.String,
    sourceUrl: Schema.String,
    passage: NullableString,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("appendChatMessage"),
    id: Schema.String,
    threadId: Schema.String,
    role: AiChatRole,
    content: Schema.String,
    createdAt: Schema.String,
  }),
)
export type SyncJob = Schema.Schema.Type<typeof SyncJob>
