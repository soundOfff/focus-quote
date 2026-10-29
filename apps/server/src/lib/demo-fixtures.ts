import { createHash } from "node:crypto"
import type {
  GenInput,
  LlmTask,
  QuoteAssistantOutput,
  RecallQuestion,
  ResourceRecommendation,
} from "./llm"

/**
 * Portfolio demo mode (DEMO_FIXTURES=1). Every model call resolves here instead
 * of reaching a provider: one fixture per `LlmTask`, each returning the JSON
 * object the real model is prompted for, so the callers' parsing and
 * persistence run unchanged. All content is synthetic.
 */

export interface DemoPage {
  url: string
  title: string
  content: string
}

export interface DemoSession {
  goal: string
  topic: string
  title: string
  daysAgo: number
  startHour: number
  durationMinutes: number
  pages: ReadonlyArray<DemoPage>
  summary?: string
  tips?: ReadonlyArray<string>
  recall?: ReadonlyArray<RecallQuestion>
  resources?: ReadonlyArray<ResourceRecommendation>
}

const wiki = (slug: string, title: string, content: string): DemoPage => ({
  url: `https://en.wikipedia.org/wiki/${slug}`,
  title: `${title} - Wikipedia`,
  content,
})

/** The showcased session: its report is the one the demo recording opens. */
export const DEMO_REPORT_GOAL = "How memory consolidates during sleep"

export const DEMO_SESSIONS: ReadonlyArray<DemoSession> = [
  {
    goal: DEMO_REPORT_GOAL,
    topic: "Cognitive Science",
    title: "Memory Consolidation and Sleep",
    daysAgo: 1,
    startHour: 9,
    durationMinutes: 45,
    pages: [
      wiki(
        "Forgetting_curve",
        "Forgetting curve",
        "The forgetting curve shows how retention of new material falls steeply at first and then levels off unless it is reviewed.",
      ),
      wiki(
        "Memory_consolidation",
        "Memory consolidation",
        "Synaptic consolidation stabilises a trace within hours; systems consolidation reorganises it across brain regions over weeks to years.",
      ),
      wiki(
        "Hippocampus",
        "Hippocampus",
        "The hippocampus binds new experiences and later replays them so the neocortex can store them for the long term.",
      ),
      wiki(
        "Sleep_and_memory",
        "Sleep and memory",
        "Slow-wave sleep is associated with hippocampal replay that strengthens recently encoded memories.",
      ),
      {
        url: "https://www.britannica.com/science/memory-psychology",
        title: "Memory | Definition, Types, & Facts | Britannica",
        content:
          "Memory is the encoding, storage and retrieval in the human mind of past experiences.",
      },
    ],
    summary:
      "You traced a memory from encoding to long-term storage: the forgetting curve first, then how the hippocampus replays new traces during slow-wave sleep and hands them to the cortex. The session stayed on-goal throughout, with the deepest reading on sleep and memory. Before your next session, explain hippocampal replay out loud in two minutes without notes.",
    tips: [
      "Since you read about the forgetting curve, schedule two short reviews of today's notes: one tomorrow and one in three days.",
      "Draw the path a memory takes from the hippocampus to the cortex, and mark where slow-wave sleep helps.",
      "Turn the systems consolidation section into three flashcards, one claim per card, with the evidence on the back.",
      "Compare synaptic and systems consolidation in a two-column table: timescale, brain regions, and what disrupts each.",
    ],
    recall: [
      {
        q: "What does the forgetting curve describe?",
        a: "How retention of newly learned material drops quickly at first and then levels off, unless it is reviewed.",
      },
      {
        q: "Which brain structure holds new memories before they are consolidated into the cortex?",
        a: "The hippocampus, which replays recent experiences so the neocortex can store them long term.",
      },
      {
        q: "Why does slow-wave sleep matter for memory?",
        a: "During slow-wave sleep the hippocampus replays recent traces, which strengthens them and moves them toward the cortex.",
      },
      {
        q: "How do synaptic and systems consolidation differ?",
        a: "Synaptic consolidation stabilises a trace within hours at the synapse; systems consolidation reorganises it across brain regions over weeks to years.",
      },
      {
        q: "What is one practical way to flatten the forgetting curve?",
        a: "Spaced review: revisit the material at growing intervals, such as one day, three days and a week later.",
      },
    ],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Spacing_effect",
        title: "Spacing effect",
        why: "Builds on the forgetting curve with the evidence for spreading reviews over time.",
      },
      {
        url: "https://en.wikipedia.org/wiki/Testing_effect",
        title: "Testing effect",
        why: "Shows why recalling material beats rereading it, which is what your recall quiz trains.",
      },
      {
        url: "https://en.wikipedia.org/wiki/Slow-wave_sleep",
        title: "Slow-wave sleep",
        why: "Goes one level deeper on the sleep stage your notes credit with memory replay.",
      },
      {
        url: "https://en.wikipedia.org/wiki/Hermann_Ebbinghaus",
        title: "Hermann Ebbinghaus",
        why: "The original experiments behind the forgetting curve, and how he measured savings.",
      },
    ],
  },
  {
    goal: "Review the forgetting curve",
    topic: "Cognitive Science",
    title: "Forgetting Curve Review",
    daysAgo: 0,
    startHour: 8,
    durationMinutes: 25,
    pages: [
      wiki("Forgetting_curve", "Forgetting curve", "Retention falls steeply, then levels off."),
      wiki("Spacing_effect", "Spacing effect", "Spaced reviews beat massed practice."),
    ],
  },
  {
    goal: "Read Lovelace's Note G",
    topic: "History of Computing",
    title: "Lovelace's Note G",
    daysAgo: 2,
    startHour: 16,
    durationMinutes: 40,
    pages: [
      wiki("Note_G", "Note G", "Note G describes an algorithm for the Analytical Engine to compute Bernoulli numbers."),
      wiki("Analytical_engine", "Analytical engine", "The Analytical Engine was a proposed general-purpose mechanical computer."),
    ],
  },
  {
    goal: "Raft leader election",
    topic: "Distributed Systems",
    title: "Raft Leader Election",
    daysAgo: 3,
    startHour: 10,
    durationMinutes: 50,
    pages: [
      {
        url: "https://raft.github.io/",
        title: "Raft Consensus Algorithm",
        content: "Raft is a consensus algorithm designed to be easy to understand.",
      },
      wiki("Raft_(algorithm)", "Raft (algorithm)", "Raft elects a leader that manages log replication."),
    ],
  },
  {
    goal: "Spaced repetition schedules",
    topic: "Cognitive Science",
    title: "Spaced Repetition Schedules",
    daysAgo: 4,
    startHour: 18,
    durationMinutes: 30,
    pages: [
      wiki("Spaced_repetition", "Spaced repetition", "Spaced repetition schedules reviews at increasing intervals."),
      wiki("Leitner_system", "Leitner system", "The Leitner system sorts flashcards into boxes by how well they are known."),
    ],
  },
  {
    goal: "Outline the essay on attention",
    topic: "Writing Craft",
    title: "Essay Outline on Attention",
    daysAgo: 5,
    startHour: 11,
    durationMinutes: 25,
    pages: [
      wiki("Attention", "Attention", "Attention is the selective concentration on one aspect of the environment."),
    ],
  },
  {
    goal: "Consistent hashing",
    topic: "Distributed Systems",
    title: "Consistent Hashing",
    daysAgo: 6,
    startHour: 14,
    durationMinutes: 45,
    pages: [
      wiki("Consistent_hashing", "Consistent hashing", "Consistent hashing remaps only a small share of keys when nodes change."),
    ],
  },
]

/**
 * Theme keywords for filing quotes into Tags, checked in order so a quote that
 * mentions both memory and attention files under the first match.
 */
const QUOTE_THEMES: ReadonlyArray<{ tag: string; pattern: RegExp }> = [
  { tag: "Computing", pattern: /analytical engine|machine|babbage|\bdata\b/i },
  { tag: "Memory", pattern: /memor|remember|forget/i },
  { tag: "Attention", pattern: /attend|attention|focus|two things at once/i },
  { tag: "Habits", pattern: /habit/i },
  { tag: "Curiosity", pattern: /curios|wonder/i },
  { tag: "Learning", pattern: /read|learn|stud|book|mind is not/i },
  { tag: "Writing", pattern: /\bword|letter|\bwit\b|writ/i },
  { tag: "Time", pattern: /\btime\b|\blife\b/i },
  { tag: "Science", pattern: /ignorance|giants|truth|species/i },
]

const FALLBACK_THEME = "Ideas"

/** Child -> parent Tag names the "Tidy now" fixture proposes as hierarchy. */
const TAG_PARENTS: Readonly<Record<string, string>> = {
  Memory: "Learning",
  Attention: "Learning",
  Habits: "Learning",
  Curiosity: "Learning",
  Computing: "Science",
}

const themeFor = (text: string): string =>
  QUOTE_THEMES.find((t) => t.pattern.test(text))?.tag ?? FALLBACK_THEME

interface FixtureRequest {
  system: string
  user: Record<string, unknown>
}

type Fixture = (req: FixtureRequest) => unknown

const asArray = (v: unknown): ReadonlyArray<Record<string, unknown>> =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    : []

const asString = (v: unknown): string => (typeof v === "string" ? v : "")

const pageTitles = (user: Record<string, unknown>): string[] =>
  asArray(user.urls)
    .map((u) => asString(u.title).replace(/ - Wikipedia$/, ""))
    .filter((t) => t.length > 0)

/** The scripted session a request is about: by goal, else by its first visited URL. */
const sessionFor = (user: Record<string, unknown>): DemoSession | undefined => {
  const goal = asString(user.goal)
  const firstUrl = asString(asArray(user.urls)[0]?.url)
  return (
    DEMO_SESSIONS.find((s) => s.goal === goal) ??
    DEMO_SESSIONS.find((s) => s.pages.some((p) => p.url === firstUrl))
  )
}

const goalPhrase = (user: Record<string, unknown>): string => {
  const goal = asString(user.goal)
  return goal && !goal.startsWith("(") ? goal.toLowerCase() : "this topic"
}

const genericTips = (user: Record<string, unknown>): string[] => {
  const [first = "the first page", second = "your notes"] = pageTitles(user)
  return [
    `Since you started with ${first}, write its main claim from memory before rereading it.`,
    `Connect ${second} to something you already know and note the link in your Vault.`,
    `Schedule a five-minute review of ${goalPhrase(user)} tomorrow, then again in three days.`,
  ]
}

const genericRecall = (user: Record<string, unknown>): RecallQuestion[] =>
  pageTitles(user).map((title) => ({
    q: `What is the central idea of ${title}?`,
    a: `The key claim you read about ${title}, explained in your own words.`,
  }))

const tokens = (s: string): Set<string> =>
  new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? [])

const overlap = (expected: string, answer: string): number => {
  const want = tokens(expected)
  if (want.size === 0) return 0
  const got = tokens(answer)
  let hit = 0
  for (const w of want) {
    if ([...got].some((g) => g.startsWith(w.slice(0, 5)) || w.startsWith(g.slice(0, 5)))) hit++
  }
  return hit / want.size
}

const GRADE_FEEDBACK = {
  correct:
    "Correct. You covered the key ideas in your own words, which is what makes them stick.",
  partial:
    "Partly there. You have the gist; add the missing detail from the expected answer to make it complete.",
  incorrect:
    "Not quite yet. Compare your answer with the expected one, then try this card again tomorrow.",
} as const

const FIXTURES: Record<LlmTask, Fixture> = {
  classifyUrl: () => ({ category: "research", distractionScore: 12, nudge: null }),

  summarizeSession: ({ user }) => {
    const scripted = sessionFor(user)?.summary
    if (scripted) return { summary: scripted }
    const titles = pageTitles(user)
    return {
      summary: `You stayed on ${goalPhrase(user)} for the whole session, moving from ${titles[0] ?? "your first page"} to ${titles[titles.length - 1] ?? "your notes"}. Close the next one by writing three lines from memory before you reopen anything.`,
    }
  },

  generateStudyTips: ({ user }) => ({
    tips: sessionFor(user)?.tips ?? genericTips(user),
  }),

  generateRecallQuestions: ({ system, user }) => {
    const count = Number(/EXACTLY (\d+)/.exec(system)?.[1] ?? 5)
    const questions = sessionFor(user)?.recall ?? genericRecall(user)
    return { questions: questions.slice(0, count) }
  },

  generateResourceRecommendations: ({ user }) => ({
    resources: sessionFor(user)?.resources ?? [
      {
        url: "https://en.wikipedia.org/wiki/Testing_effect",
        title: "Testing effect",
        why: "Recalling what you studied is the fastest way to make it stick.",
      },
    ],
  }),

  generateTopic: () => ({ topic: "Learning" }),

  generateSessionTitle: ({ user }) => ({
    title: sessionFor(user)?.title ?? (pageTitles(user)[0] ?? "Focused Reading"),
  }),

  gradeRecallAnswer: ({ user }) => {
    const score = overlap(asString(user.expected), asString(user.student))
    const verdict = score >= 0.45 ? "correct" : score >= 0.2 ? "partial" : "incorrect"
    return { verdict, feedback: GRADE_FEEDBACK[verdict] }
  },

  classifyQuoteIntoTags: ({ user }) => {
    const theme = themeFor(asString(user.quote))
    const existing = asArray(user.tags).find((t) => t.name === theme)
    return existing
      ? { attachTagIds: [asString(existing.id)], newTag: null }
      : { attachTagIds: [], newTag: theme }
  },

  classifyQuotesIntoTagsBatch: ({ user }) => {
    const tags = asArray(user.tags)
    return {
      results: asArray(user.quotes).map((q) => {
        const theme = themeFor(asString(q.text))
        const existing = tags.find((t) => t.name === theme)
        return existing
          ? { id: q.id, attachTagIds: [asString(existing.id)], newTag: null }
          : { id: q.id, attachTagIds: [], newTag: theme }
      }),
    }
  },

  proposeTagConsolidation: ({ user }) => {
    const idByName = new Map(asArray(user.tags).map((t) => [asString(t.name), asString(t.id)]))
    const parents = Object.entries(TAG_PARENTS).flatMap(([child, parent]) => {
      const childId = idByName.get(child)
      const parentId = idByName.get(parent)
      return childId && parentId ? [{ childId, parentId }] : []
    })
    return { merges: [], renames: [], parents }
  },

  generateGuideSteps: ({ user }) => {
    const page = asArray([user.page])[0] ?? {}
    const elements = asArray(page.elements).slice(0, 3)
    return {
      steps: elements.map((e, i) => ({
        ref: e.ref,
        instruction: `Step ${i + 1}: ${asString(e.label) || "Open this control"}`,
        description: "This control moves you toward your goal.",
        x: e.x,
        y: e.y,
      })),
    }
  },
}

export const demoCompletion = (input: GenInput): string => {
  const parsed: unknown = JSON.parse(input.user)
  const user =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  return JSON.stringify(FIXTURES[input.task]({ system: input.system, user }))
}

const EMBEDDING_DIMENSIONS = 64

/** Hashed bag-of-words vector: deterministic, and similar texts score as similar. */
export const demoEmbedding = (text: string): number[] => {
  const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  for (const word of text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
    const bucket = createHash("sha256").update(word).digest()[0] ?? 0
    vec[bucket % EMBEDDING_DIMENSIONS] = (vec[bucket % EMBEDDING_DIMENSIONS] ?? 0) + 1
  }
  const norm = Math.hypot(...vec) || 1
  return vec.map((v) => v / norm)
}

export const demoQuoteAssistantReply = (input: {
  passage?: string
  userMessage: string
}): QuoteAssistantOutput => {
  const passage = (input.passage ?? "").trim().replace(/\s+/g, " ")
  const gist = passage.length > 160 ? `${passage.slice(0, 157)}...` : passage
  return {
    reply: [
      gist
        ? `The passage argues one thing worth keeping: "${gist}"`
        : "This page argues that spacing out your reviews beats cramming.",
      "Forgetting a little between reviews makes the next recall harder, and that effort is what strengthens the memory.",
      "1. How long should the first gap be?\n2. Does this hold for skills as well as facts?\n3. How does sleep fit in?",
    ].join("\n\n"),
    sources: [
      {
        title: "Spacing effect",
        url: "https://en.wikipedia.org/wiki/Spacing_effect",
        snippet: "The research behind spreading study sessions over time.",
      },
    ],
  }
}
