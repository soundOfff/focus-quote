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
