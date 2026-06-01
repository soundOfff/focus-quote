import { Effect, Schema } from "effect"
import type { StorageService } from "../services/storage"

/**
 * Local-only persistence for the Job Application "Application Profile": the
 * user's CV (plain text) and their Answer Bank (editable question/answer
 * templates). Per docs/adr/0004-local-only-job-application-data.md this data
 * NEVER syncs to the server — there are deliberately no pull/push helpers here.
 * It lives only in chrome.storage.local via StorageService.
 */

export const JOB_PROFILE_KEY = "focusquote.jobProfile"

export const AnswerCategory = Schema.Literal(
  "about",
  "experience",
  "motivation",
  "technical",
)
export type AnswerCategory = Schema.Schema.Type<typeof AnswerCategory>

export const CATEGORY_ORDER: ReadonlyArray<AnswerCategory> = [
  "about",
  "experience",
  "motivation",
  "technical",
]

export const CATEGORY_LABELS: Record<AnswerCategory, string> = {
  about: "About You",
  experience: "Experience",
  motivation: "Motivation",
  technical: "Technical & Skills",
}

const CATEGORY_SET = new Set<string>(CATEGORY_ORDER)

/** A single question/answer pair in the Answer Bank (see CONTEXT.md). */
export const AnswerTemplate = Schema.Struct({
  id: Schema.String,
  category: AnswerCategory,
  question: Schema.String,
  /** The user's answer. Empty string = unanswered. */
  answer: Schema.String,
  /** True if the user added this question themselves (vs the default seed). */
  custom: Schema.Boolean,
})
export type AnswerTemplate = Schema.Schema.Type<typeof AnswerTemplate>

/** CV (plain text) + Answer Bank — the local-only Application Profile. */
export const JobProfile = Schema.Struct({
  cv: Schema.String,
  templates: Schema.Array(AnswerTemplate),
})
export type JobProfile = Schema.Schema.Type<typeof JobProfile>

// Editable default seed — ~14 questions across the four categories. These are
// only the starting point: the user can edit, delete, or add to them, and we
// persist whatever they end up with (we do NOT re-merge defaults on load, so a
// deleted default stays deleted).
export const DEFAULT_TEMPLATES: ReadonlyArray<AnswerTemplate> = [
  { id: "about-1", category: "about", question: "Tell me about yourself.", answer: "", custom: false },
  { id: "about-2", category: "about", question: "What are your greatest strengths?", answer: "", custom: false },
  { id: "about-3", category: "about", question: "What are your weaknesses?", answer: "", custom: false },
  { id: "about-4", category: "about", question: "What motivates you?", answer: "", custom: false },
  { id: "exp-1", category: "experience", question: "Describe a challenge you overcame at work.", answer: "", custom: false },
  { id: "exp-2", category: "experience", question: "Tell me about a time you worked in a team.", answer: "", custom: false },
  { id: "exp-3", category: "experience", question: "Describe a conflict you resolved.", answer: "", custom: false },
  { id: "exp-4", category: "experience", question: "Tell me about a project you're proud of.", answer: "", custom: false },
  { id: "mot-1", category: "motivation", question: "Why are you looking for a new role?", answer: "", custom: false },
  { id: "mot-2", category: "motivation", question: "What are your career goals?", answer: "", custom: false },
  { id: "mot-3", category: "motivation", question: "What kind of work environment do you thrive in?", answer: "", custom: false },
  { id: "tech-1", category: "technical", question: "What are your key technical skills?", answer: "", custom: false },
  { id: "tech-2", category: "technical", question: "How do you keep your skills up to date?", answer: "", custom: false },
  { id: "tech-3", category: "technical", question: "Describe your ideal tech stack and why.", answer: "", custom: false },
]

export const defaultJobProfile: JobProfile = {
  cv: "",
  templates: DEFAULT_TEMPLATES,
}

// Generous caps so a single malformed/huge entry can't bloat storage but real
// answers (and pasted CVs) comfortably fit.
const MAX_CV = 100_000
const MAX_QUESTION = 2_000
const MAX_ANSWER = 20_000
const MAX_ID = 200

const cleanString = (value: unknown, max: number): string =>
  typeof value === "string" ? value.slice(0, max) : ""

const normalizeTemplate = (raw: unknown): AnswerTemplate | null => {
  if (!raw || typeof raw !== "object") return null
  const input = raw as Record<string, unknown>
  const id = cleanString(input.id, MAX_ID).trim()
  if (!id) return null
  const category =
    typeof input.category === "string" && CATEGORY_SET.has(input.category)
      ? (input.category as AnswerCategory)
      : "about"
  return {
    id,
    category,
    question: cleanString(input.question, MAX_QUESTION),
    answer: cleanString(input.answer, MAX_ANSWER),
    custom: typeof input.custom === "boolean" ? input.custom : false,
  }
}

const normalize = (raw: unknown): JobProfile => {
  if (!raw || typeof raw !== "object") return defaultJobProfile
  const input = raw as Record<string, unknown>
  const cv = cleanString(input.cv, MAX_CV)
  // Distinguish a legitimately-emptied bank (Array, possibly []) from corrupt
  // / missing data (anything else → fall back to the seed). De-dupe ids so a
  // corrupt write can't break selection-by-id in the UI.
  let templates: AnswerTemplate[]
  if (Array.isArray(input.templates)) {
    const seen = new Set<string>()
    templates = []
    for (const entry of input.templates) {
      const t = normalizeTemplate(entry)
      if (t && !seen.has(t.id)) {
        seen.add(t.id)
        templates.push(t)
      }
    }
  } else {
    templates = [...DEFAULT_TEMPLATES]
  }
  return { cv, templates }
}

export const loadJobProfile = (
  storage: StorageService,
): Effect.Effect<JobProfile> =>
  Effect.gen(function* () {
    const raw = yield* storage
      .get<unknown>(JOB_PROFILE_KEY)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))
    return normalize(raw)
  })

export const saveJobProfile = (
  storage: StorageService,
  next: JobProfile,
): Effect.Effect<void, never> =>
  storage
    .set(JOB_PROFILE_KEY, normalize(next))
    .pipe(Effect.catchAll(() => Effect.void))

// ---- Pure helpers (no UI, no I/O) ----

export const isAnswered = (t: AnswerTemplate): boolean =>
  t.answer.trim().length > 0

export const answeredCount = (
  templates: ReadonlyArray<AnswerTemplate>,
): number => templates.filter(isAnswered).length

export const completionPct = (
  templates: ReadonlyArray<AnswerTemplate>,
): number =>
  templates.length === 0
    ? 0
    : Math.round((answeredCount(templates) / templates.length) * 100)

export const byCategory = (
  templates: ReadonlyArray<AnswerTemplate>,
  category: AnswerCategory,
): AnswerTemplate[] => templates.filter((t) => t.category === category)

/**
 * Deterministic-ish id for a newly-added custom question. Uses crypto when
 * available (collision-proof) and falls back to a counter derived from the
 * current bank size so two rapid adds don't clash.
 */
export const newCustomId = (
  templates: ReadonlyArray<AnswerTemplate>,
): string => {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `custom-${uuid}`
  const n = templates.filter((t) => t.custom).length + 1
  return `custom-${n}-${templates.length}`
}
