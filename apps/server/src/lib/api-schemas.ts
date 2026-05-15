import { z } from "zod"

const NullableString = z.string().nullable().optional().transform((v) => v ?? null)

// ---- Quote ----

export const NewQuoteInput = z.object({
  text: z.string().min(1),
  sourceUrl: NullableString,
  sourceTitle: NullableString,
  tag: NullableString,
})
export type NewQuoteInput = z.infer<typeof NewQuoteInput>

export const ListQuotesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  q: z.string().optional(),
})
export type ListQuotesQuery = z.infer<typeof ListQuotesQuery>

// ---- Focus session ----

export const UpsertFocusSessionInput = z.object({
  id: z.string().min(1).optional(),
  goal: NullableString,
  durationMinutes: z.number().int().min(1).max(180),
  breakMinutes: z.number().int().min(0).max(60),
  completed: z.boolean().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().nullable().optional(),
})
export type UpsertFocusSessionInput = z.infer<typeof UpsertFocusSessionInput>

// ---- Sync batch ----

const ISO = z.string().min(1)

// ---- Session URL (AI analysis) ----

export const NewSessionUrlInput = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  url: z.string().min(1).max(2048),
  hostname: z.string().min(1).max(255),
  title: NullableString,
  content: NullableString,
  visitedAt: z.string().min(1),
})
export type NewSessionUrlInput = z.infer<typeof NewSessionUrlInput>

export const SessionUrlBatchInput = z.object({
  urls: z.array(NewSessionUrlInput).min(1).max(20),
})
export type SessionUrlBatchInput = z.infer<typeof SessionUrlBatchInput>

export const ListSessionUrlsQuery = z.object({
  sessionId: z.string().min(1),
})
export type ListSessionUrlsQuery = z.infer<typeof ListSessionUrlsQuery>

export const SessionActionKindInput = z.enum([
  "click",
  "focus",
  "blur",
  "submit",
  "scroll",
  "nav",
])

export const NewSessionActionInput = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  kind: SessionActionKindInput,
  payload: z.string().min(1).max(4000),
  at: ISO,
})
export type NewSessionActionInput = z.infer<typeof NewSessionActionInput>

export const SessionActionBatchInput = z.object({
  actions: z.array(NewSessionActionInput).min(1).max(200),
})
export type SessionActionBatchInput = z.infer<typeof SessionActionBatchInput>

export const ListSessionActionsQuery = z.object({
  sessionId: z.string().min(1),
})
export type ListSessionActionsQuery = z.infer<typeof ListSessionActionsQuery>

export const MediaKindInput = z.enum(["profile_photo", "screenshot"])

export const UploadMediaInput = z.object({
  kind: MediaKindInput,
  mimeType: z.string().min(1).max(120),
  dataBase64: z.string().min(1),
  byteSize: z.number().int().min(1).max(10 * 1024 * 1024),
  sessionId: z.string().min(1).nullable().optional(),
})
export type UploadMediaInput = z.infer<typeof UploadMediaInput>

export const ListMediaQuery = z.object({
  kind: MediaKindInput.optional(),
  sessionId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})
export type ListMediaQuery = z.infer<typeof ListMediaQuery>

export const SyncJobInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("upsertQuote"),
    id: z.string().min(1),
    text: z.string().min(1),
    sourceUrl: z.string().nullable(),
    sourceTitle: z.string().nullable(),
    tag: z.string().nullable(),
    createdAt: ISO,
    updatedAt: ISO,
  }),
  z.object({
    kind: z.literal("deleteQuote"),
    id: z.string().min(1),
  }),
  z.object({
    kind: z.literal("upsertSession"),
    id: z.string().min(1),
    goal: z.string().nullable(),
    durationMinutes: z.number().int().min(1).max(180),
    breakMinutes: z.number().int().min(0).max(60),
    completed: z.boolean(),
    startedAt: ISO,
    endedAt: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("upsertSessionUrl"),
    id: z.string().min(1),
    sessionId: z.string().min(1),
    url: z.string().min(1).max(2048),
    hostname: z.string().min(1).max(255),
    title: z.string().nullable(),
    content: z.string().nullable(),
    visitedAt: ISO,
  }),
  z.object({
    kind: z.literal("upsertSessionAction"),
    id: z.string().min(1),
    sessionId: z.string().min(1),
    actionKind: SessionActionKindInput,
    payload: z.string().min(1).max(4000),
    at: ISO,
  }),
])
export type SyncJobInput = z.infer<typeof SyncJobInput>

export const SyncBatchInput = z.object({
  jobs: z.array(SyncJobInput).min(1).max(500),
})
export type SyncBatchInput = z.infer<typeof SyncBatchInput>

// ---- User settings / profile / privacy (remote source of truth) ----

const ThemeInput = z.enum(["dark", "light"])

export const RecallDepthInput = z.enum(["easy", "standard", "challenging"])
export type RecallDepthInput = z.infer<typeof RecallDepthInput>

export const RecallQuestionCountInput = z
  .union([z.literal(3), z.literal(5), z.literal(7)])
  .or(z.coerce.number().int().min(3).max(7))

export const UserSettingsInput = z.object({
  theme: ThemeInput,
  defaultDurationMinutes: z.number().int().min(1).max(180),
  defaultBreakMinutes: z.number().int().min(0).max(60),
  translateFromLang: z.string().min(1).max(16),
  translateToLang: z.string().min(1).max(16),
  todayGoal: z.string().max(280).nullable().optional(),
  debugOverlayEnabled: z.boolean().optional(),
  notificationsBlocked: z.boolean().optional(),
  toolbarSide: z.enum(["left", "right"]).optional(),
  recallEnabled: z.boolean().optional(),
  recallQuestionCount: RecallQuestionCountInput.optional(),
  recallDepth: RecallDepthInput.optional(),
  recallAutoGenerate: z.boolean().optional(),
})
export type UserSettingsInput = z.infer<typeof UserSettingsInput>

export const UserProfileInput = z.object({
  displayName: z.string().max(80).default(""),
  headline: z.string().max(160).default(""),
  photoMediaFileId: z.string().max(120).nullable().optional(),
})
export type UserProfileInput = z.infer<typeof UserProfileInput>

export const UserPrivacyInput = z.object({
  trackUrls: z.boolean(),
  blocklist: z.array(z.string().min(1).max(255)).max(500),
})
export type UserPrivacyInput = z.infer<typeof UserPrivacyInput>

// ---- Secrets ----

export const SecretKindInput = z.enum(["openrouter"])
export type SecretKindInput = z.infer<typeof SecretKindInput>

export const PutSecretInput = z.object({
  value: z.string().min(1).max(4096),
})
export type PutSecretInput = z.infer<typeof PutSecretInput>

// ---- AI chat history ----

export const AiThreadKindInput = z.enum(["quote_assistant", "guide_me"])
export type AiThreadKindInput = z.infer<typeof AiThreadKindInput>

export const CreateAiThreadInput = z.object({
  id: z.string().min(1).max(120).optional(),
  kind: AiThreadKindInput,
  passage: NullableString,
  sourceUrl: NullableString,
  goal: NullableString,
})
export type CreateAiThreadInput = z.infer<typeof CreateAiThreadInput>

export const ListAiThreadsQuery = z.object({
  kind: AiThreadKindInput.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListAiThreadsQuery = z.infer<typeof ListAiThreadsQuery>

export const AppendAiMessageInput = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
})
export type AppendAiMessageInput = z.infer<typeof AppendAiMessageInput>

// ---- Recall attempts ----

export const ListRecallAttemptsQuery = z.object({
  sessionId: z.string().min(1),
})
export type ListRecallAttemptsQuery = z.infer<typeof ListRecallAttemptsQuery>

// ---- Toolbar runtime state ----

export const PutToolbarStateInput = z.object({
  payload: z.string().min(0).max(200_000),
})
export type PutToolbarStateInput = z.infer<typeof PutToolbarStateInput>
