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
])
export type SyncJobInput = z.infer<typeof SyncJobInput>

export const SyncBatchInput = z.object({
  jobs: z.array(SyncJobInput).min(1).max(500),
})
export type SyncBatchInput = z.infer<typeof SyncBatchInput>
