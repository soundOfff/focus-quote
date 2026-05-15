import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { env } from "../env"

const ANTHROPIC_HAIKU = "claude-haiku-4-5-20251001"
const ANTHROPIC_SONNET = "claude-sonnet-4-5-20250929"

const SYSTEM_CLASSIFY = `You are a focus coach helping a user stay on task.
For each URL the user visits during a focus session, you respond with strict JSON:
{"category": string, "distractionScore": integer 0-100, "nudge": string | null}

- "category" examples: "work", "research", "social", "news", "entertainment", "shopping", "tools".
- "distractionScore": 0 means perfectly on-goal, 100 means major distraction.
- "nudge": only set when distractionScore >= 70. ONE short, kind sentence in the user's language pulling them back. Otherwise null.

Reply with ONLY the JSON object, no prose, no markdown fences.`

const SYSTEM_SUMMARY = `You are a focus coach summarizing a completed session.
You receive the session goal and a list of visited pages with category and optional text snippets from those pages.
Ground your claims in the provided page text whenever possible. Do not invent facts not supported by the snippets.
Reply with strict JSON: {"summary": string} containing 2-3 short sentences in the user's language reviewing what they did, on-goal vs off-goal patterns, and one actionable tip.
No prose outside JSON, no markdown fences.`

const SYSTEM_STUDY_TIPS = `You are a study coach. The user just finished a focus session.
You receive the session goal and the URLs they visited (with titles).
Generate 3 to 5 concrete, actionable study tips to deepen their understanding of THIS topic. Each tip is one or two sentences in the user's language. Where useful, reference specifics from the visited content (e.g. "since you looked at X, also explore Y"). Avoid generic advice like "take breaks".
Reply with strict JSON: {"tips": string[]}. No prose outside JSON, no markdown fences.`

const buildRecallSystem = (count: number, depth: string) => {
  const depthHint =
    depth === "easy"
      ? "Keep the questions easy — single concept, short answers, foundational recall."
      : depth === "challenging"
        ? "Make the questions challenging — multi-step reasoning, edge cases, comparisons across the visited content."
        : "Use standard difficulty — concrete questions on the core ideas."
  return `You are a study coach designing active-recall prompts for a learner.
You receive the session goal and the URLs they visited (with titles).
Generate EXACTLY ${count} short questions that test the core ideas the user just engaged with. Each question must be answerable from the visited content. For each, also include the correct answer (one to three sentences).
${depthHint}
Reply with strict JSON: {"questions": [{"q": string, "a": string}]} in the user's language. No prose outside JSON, no markdown fences.`
}

export const TOPIC_CATEGORIES = [
  "Programming",
  "Research",
  "Learning",
  "Writing",
  "Reading",
  "Health",
  "Finance",
  "Productivity",
  "Entertainment",
  "Social",
  "Shopping",
  "Other",
] as const
export type TopicCategory = (typeof TOPIC_CATEGORIES)[number]

const SYSTEM_TOPIC = `You are a librarian assigning a broad category to a focus session.
You receive: the session goal and the URLs visited (with titles).
Pick ONE label from this exact list (return the exact spelling/casing):
${TOPIC_CATEGORIES.join(" | ")}

Guidance: pick the single best fit. If a session covers multiple themes, pick the dominant one. Use "Other" only when no category fits at all.
Reply with strict JSON: {"topic": string} where "topic" is one of the labels above. No prose outside JSON, no markdown fences.`

const SYSTEM_GRADE = `You are grading a student's active-recall answer.
You receive: the question, the expected answer, and the student's answer.
Reply with strict JSON: {"verdict": "correct" | "partial" | "incorrect", "feedback": string}
- "correct": substantially matches the key ideas of the expected answer.
- "partial": gets some key ideas but misses important parts, OR is on-topic but vague.
- "incorrect": wrong, off-topic, or empty.
- "feedback": one or two sentences in the student's language. Be encouraging but honest. If partial/incorrect, point at the specific gap.
No prose outside JSON, no markdown fences.`

const SYSTEM_QUOTE_ASSISTANT = `You are a helpful reading assistant. The user has highlighted a passage on a web page and wants help with it.
- If they haven't asked a specific question yet, give a concise, high-signal summary of the passage and offer 2-3 short suggested follow-up questions at the end.
- If they ask a question, answer based on the passage. If the passage isn't enough, say so plainly.
- Keep replies short (under 180 words) and well-structured. No markdown headings — short paragraphs only.
- Respond in the user's language.`

const SYSTEM_GUIDE_STEPS = `You are a UI navigation assistant. Given a user's goal, return a JSON array of steps.
Each step has: { "instruction": string, "x": number (0-1 normalized viewport fraction), "y": number (0-1 normalized viewport fraction), "description": string }
- "instruction" is what the user should do at this waypoint (e.g. "Click the profile icon").
- "x" and "y" are estimates of where on a typical web app this control sits. Use sensible defaults: top-right user menus (0.95, 0.06), left sidebars (0.1, 0.3..0.7), main content centers (0.5, 0.5), bottom bars (0.5, 0.95). Clamp to (0.02..0.98).
- "description" is one short sentence shown to the user as a tooltip.
- Return between 3 and 7 steps. Keep them ordered.
Reply with strict JSON: {"steps": [...]}. No markdown fences, no prose outside the JSON.`

const SYSTEM_GOAL_SUMMARY = `You are summarizing what a user was working on during a completed focus session, in the user's language.
You receive the URLs they visited (with titles).
Produce ONE short phrase (4-8 words, no period, no markdown) describing the most likely goal of the session — e.g. "Learning Rust borrow checker", "Researching travel insurance", "Job applications for senior PM roles".
Avoid generic phrases like "Browsing the web" unless the URLs are truly mixed/unfocused.
Reply with strict JSON: {"goal": string}. No prose outside JSON, no markdown fences.`

const SYSTEM_RESOURCES = `You are a study coach recommending additional resources after a focus session.
You receive the session goal and the URLs the user visited.
Recommend 3 to 5 ADDITIONAL resources (not already in their visited list) that fill gaps or deepen the topic. Aim for at least 3 — if you can only find 3 high-confidence resources, that is fine.
CRITICAL: only return real, well-known, stable URLs you are highly confident exist (official docs, well-known blogs, established YouTube channels, canonical references). Do NOT fabricate URLs. If you are not confident a URL exists, do not include it — fewer high-quality items is better than fabricated ones.
For each resource provide: url, title, and one sentence on why it's valuable for THIS user given their goal.
Reply with strict JSON: {"resources": [{"url": string, "title": string, "why": string}]} in the user's language. No prose outside JSON, no markdown fences.`

type Provider = "anthropic" | "openrouter" | "none"

const pickProvider = (): Provider => {
  if (env.LLM_PROVIDER === "anthropic")
    return env.ANTHROPIC_API_KEY ? "anthropic" : "none"
  if (env.LLM_PROVIDER === "openrouter")
    return env.OPENROUTER_API_KEY ? "openrouter" : "none"
  if (env.ANTHROPIC_API_KEY) return "anthropic"
  if (env.OPENROUTER_API_KEY) return "openrouter"
  return "none"
}

let anthropicClient: Anthropic | null = null
const getAnthropic = (): Anthropic | null => {
  if (!env.ANTHROPIC_API_KEY) return null
  if (!anthropicClient)
    anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return anthropicClient
}

let openrouterClient: OpenAI | null = null
const getOpenRouter = (): OpenAI | null => {
  if (!env.OPENROUTER_API_KEY) return null
  if (!openrouterClient) {
    openrouterClient = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      // OpenRouter uses these for attribution / rate-limit pools.
      defaultHeaders: {
        "HTTP-Referer": env.BETTER_AUTH_URL,
        "X-Title": "FocusQuote",
      },
    })
  }
  return openrouterClient
}

interface GenInput {
  system: string
  user: string
  maxTokens: number
  tier: "fast" | "smart"
  expectJson: boolean
}

const generate = async (input: GenInput): Promise<string | null> => {
  const provider = pickProvider()
  if (provider === "anthropic") {
    const c = getAnthropic()
    if (!c) return null
    const res = await c.messages.create({
      model: input.tier === "smart" ? ANTHROPIC_SONNET : ANTHROPIC_HAIKU,
      max_tokens: input.maxTokens,
      system: [
        {
          type: "text",
          text: input.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: input.user }],
    })
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
  }
  if (provider === "openrouter") {
    const c = getOpenRouter()
    if (!c) return null
    try {
      const res = await c.chat.completions.create({
        model: env.OPENROUTER_MODEL,
        max_tokens: input.maxTokens,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        ...(input.expectJson
          ? { response_format: { type: "json_object" } }
          : {}),
      })
      return res.choices[0]?.message?.content ?? null
    } catch (err) {
      logOpenRouterError(err, {
        model: env.OPENROUTER_MODEL,
        expectJson: input.expectJson,
      })
      return null
    }
  }
  return null
}

export interface UrlClassification {
  category: string
  distractionScore: number
  nudge: string | null
}

export const classifyUrl = async (input: {
  url: string
  title: string | null
  goal: string | null
}): Promise<UrlClassification | null> => {
  const userMessage = JSON.stringify({
    goal: input.goal ?? "(no explicit goal)",
    url: input.url,
    title: input.title ?? "",
  })

  try {
    const text = await generate({
      system: SYSTEM_CLASSIFY,
      user: userMessage,
      maxTokens: 200,
      tier: "fast",
      expectJson: true,
    })
    if (!text) return null
    const parsed = JSON.parse(stripFences(text)) as UrlClassification
    if (
      typeof parsed.category !== "string" ||
      typeof parsed.distractionScore !== "number"
    ) {
      return null
    }
    return {
      category: parsed.category,
      distractionScore: Math.max(
        0,
        Math.min(100, Math.round(parsed.distractionScore)),
      ),
      nudge: typeof parsed.nudge === "string" ? parsed.nudge : null,
    }
  } catch (err) {
    console.warn("[llm] classifyUrl failed:", err)
    return null
  }
}

export interface RecallQuestion {
  q: string
  a: string
}

export interface ResourceRecommendation {
  url: string
  title: string
  why: string
}

interface StudyInput {
  goal: string | null
  urls: Array<{ url: string; category: string | null; title: string | null }>
}

const buildStudyUserMessage = (input: StudyInput) =>
  JSON.stringify({
    goal: input.goal ?? "(no explicit goal)",
    urls: input.urls.slice(0, 60),
  })

export const generateStudyTips = async (
  input: StudyInput,
): Promise<string[] | null> => {
  if (input.urls.length === 0) return null
  try {
    const text = await generate({
      system: SYSTEM_STUDY_TIPS,
      user: buildStudyUserMessage(input),
      maxTokens: 500,
      tier: "smart",
      expectJson: true,
    })
    if (!text) return null
    const parsed = JSON.parse(stripFences(text)) as { tips?: unknown }
    if (!Array.isArray(parsed.tips)) return null
    const tips = parsed.tips.filter((t): t is string => typeof t === "string")
    return tips.length > 0 ? tips : null
  } catch (err) {
    console.warn("[llm] generateStudyTips failed:", err)
    return null
  }
}

export interface RecallOptions {
  count?: 3 | 5 | 7
  depth?: "easy" | "standard" | "challenging"
}

export const generateRecallQuestions = async (
  input: StudyInput,
  opts: RecallOptions = {},
): Promise<RecallQuestion[] | null> => {
  if (input.urls.length === 0) return null
  const count = opts.count ?? 5
  const depth = opts.depth ?? "standard"
  try {
    const text = await generate({
      system: buildRecallSystem(count, depth),
      user: buildStudyUserMessage(input),
      maxTokens: 800,
      tier: "smart",
      expectJson: true,
    })
    if (!text) return null
    const parsed = JSON.parse(stripFences(text)) as { questions?: unknown }
    if (!Array.isArray(parsed.questions)) return null
    const questions = parsed.questions.flatMap((q): RecallQuestion[] => {
      if (
        typeof q !== "object" ||
        q === null ||
        typeof (q as Record<string, unknown>).q !== "string" ||
        typeof (q as Record<string, unknown>).a !== "string"
      ) {
        return []
      }
      const obj = q as { q: string; a: string }
      return [{ q: obj.q, a: obj.a }]
    })
    return questions.length > 0 ? questions : null
  } catch (err) {
    console.warn("[llm] generateRecallQuestions failed:", err)
    return null
  }
}

export const generateGoalSummary = async (
  input: StudyInput,
): Promise<string | null> => {
  if (input.urls.length === 0) return null
  try {
    const text = await generate({
      system: SYSTEM_GOAL_SUMMARY,
      user: JSON.stringify({ urls: input.urls.slice(0, 30) }),
      maxTokens: 60,
      tier: "fast",
      expectJson: true,
    })
    if (!text) return null
    const parsed = JSON.parse(stripFences(text)) as { goal?: unknown }
    if (typeof parsed.goal !== "string") return null
    const trimmed = parsed.goal.trim().replace(/\.$/, "")
    if (!trimmed) return null
    return trimmed.slice(0, 80)
  } catch (err) {
    console.warn("[llm] generateGoalSummary failed:", err)
    return null
  }
}

export const generateTopic = async (
  input: StudyInput,
): Promise<TopicCategory | null> => {
  if (input.urls.length === 0 && !input.goal) return null
  try {
    const text = await generate({
      system: SYSTEM_TOPIC,
      user: JSON.stringify({
        goal: input.goal ?? "(no explicit goal)",
        urls: input.urls.slice(0, 30),
      }),
      maxTokens: 50,
      tier: "fast",
      expectJson: true,
    })
    if (!text) return null
    const parsed = JSON.parse(stripFences(text)) as { topic?: unknown }
    if (typeof parsed.topic !== "string") return null
    const candidate = parsed.topic.trim()
    const match = TOPIC_CATEGORIES.find(
      (c) => c.toLowerCase() === candidate.toLowerCase(),
    )
    return match ?? "Other"
  } catch (err) {
    console.warn("[llm] generateTopic failed:", err)
    return null
  }
}

export type RecallVerdict = "correct" | "partial" | "incorrect"

export interface RecallGrade {
  verdict: RecallVerdict
  feedback: string
}

export const gradeRecallAnswer = async (input: {
  question: string
  expectedAnswer: string
  userAnswer: string
}): Promise<RecallGrade | null> => {
  if (!input.userAnswer.trim()) {
    return { verdict: "incorrect", feedback: "No answer was submitted." }
  }
  try {
    const text = await generate({
      system: SYSTEM_GRADE,
      user: JSON.stringify({
        question: input.question,
        expected: input.expectedAnswer,
        student: input.userAnswer,
      }),
      maxTokens: 200,
      tier: "smart",
      expectJson: true,
    })
    if (!text) return null
    const parsed = JSON.parse(stripFences(text)) as {
      verdict?: unknown
      feedback?: unknown
    }
    if (
      (parsed.verdict !== "correct" &&
        parsed.verdict !== "partial" &&
        parsed.verdict !== "incorrect") ||
      typeof parsed.feedback !== "string"
    ) {
      return null
    }
    return { verdict: parsed.verdict, feedback: parsed.feedback }
  } catch (err) {
    console.warn("[llm] gradeRecallAnswer failed:", err)
    return null
  }
}

const callResourcesOnce = async (
  input: StudyInput,
): Promise<ResourceRecommendation[]> => {
  const text = await generate({
    system: SYSTEM_RESOURCES,
    user: buildStudyUserMessage(input),
    maxTokens: 700,
    tier: "smart",
    expectJson: true,
  })
  if (!text) return []
  const parsed = JSON.parse(stripFences(text)) as { resources?: unknown }
  if (!Array.isArray(parsed.resources)) return []
  return parsed.resources.flatMap((r): ResourceRecommendation[] => {
    if (typeof r !== "object" || r === null) return []
    const obj = r as Record<string, unknown>
    if (
      typeof obj.url !== "string" ||
      typeof obj.title !== "string" ||
      typeof obj.why !== "string"
    )
      return []
    if (!/^https?:\/\//i.test(obj.url)) return []
    return [{ url: obj.url, title: obj.title, why: obj.why }]
  })
}

const MIN_RECOMMENDATIONS = 3
const MAX_RECOMMENDATIONS = 5

export const generateResourceRecommendations = async (
  input: StudyInput,
): Promise<ResourceRecommendation[] | null> => {
  if (input.urls.length === 0) return null
  try {
    let candidates = await callResourcesOnce(input)
    let verified = await validateUrls(candidates)
    // If too few survived validation, retry once. The retry's randomness
    // usually produces a different set, increasing the chance we hit the
    // floor without bloating cost.
    if (verified.length < MIN_RECOMMENDATIONS) {
      const more = await callResourcesOnce(input)
      const dedup = new Map<string, ResourceRecommendation>()
      for (const r of [...candidates, ...more]) dedup.set(r.url, r)
      candidates = Array.from(dedup.values())
      verified = await validateUrls(candidates)
    }
    if (verified.length === 0) return null
    return verified.slice(0, MAX_RECOMMENDATIONS)
  } catch (err) {
    console.warn("[llm] generateResourceRecommendations failed:", err)
    return null
  }
}

/**
 * Pings each URL with a short timeout and drops the ones that respond with
 * non-2xx or fail outright. Runs in parallel. We use HEAD first and fall
 * back to GET for hosts that reject HEAD (common). 4s budget per URL.
 */
const validateUrls = async (
  resources: ResourceRecommendation[],
): Promise<ResourceRecommendation[]> => {
  const checks = resources.map(async (r) => {
    const ok = await checkUrl(r.url)
    return ok ? r : null
  })
  const results = await Promise.all(checks)
  return results.filter((r): r is ResourceRecommendation => r !== null)
}

const checkUrl = async (url: string): Promise<boolean> => {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4000)
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
    })
    // Some servers (CDNs, JS-heavy sites) reject HEAD with 405/403 — retry GET.
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
      })
    }
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

export const summarizeSession = async (input: {
  goal: string | null
  urls: Array<{
    url: string
    category: string | null
    title: string | null
    content: string | null
  }>
}): Promise<string | null> => {
  if (input.urls.length === 0) return null

  const pages = input.urls.slice(0, 60).map((u) => ({
    url: u.url,
    title: u.title,
    category: u.category,
    contentSnippet: u.content ? u.content.slice(0, 600) : null,
  }))

  const userMessage = JSON.stringify({
    goal: input.goal ?? "(no explicit goal)",
    urls: pages.slice(0, 12),
  })

  try {
    const text = await generate({
      system: SYSTEM_SUMMARY,
      user: userMessage,
      maxTokens: 400,
      tier: "smart",
      expectJson: true,
    })
    if (!text) return null
    const parsed = JSON.parse(stripFences(text)) as { summary?: string }
    return typeof parsed.summary === "string" ? parsed.summary : null
  } catch (err) {
    console.warn("[llm] summarizeSession failed:", err)
    return null
  }
}

const stripFences = (s: string): string =>
  s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()

// ---------------- Toolbar AI ----------------

export interface QuoteAssistantTurn {
  role: "user" | "assistant"
  content: string
}

/**
 * Conversational helper for the Quote+AI toolbar button. We always include
 * the highlighted passage as the system "context" and forward the full
 * conversation so follow-ups are coherent.
 */
export const generateQuoteAssistantReply = async (input: {
  passage: string
  sourceUrl?: string | null
  history: ReadonlyArray<QuoteAssistantTurn>
  userMessage: string
}): Promise<string | null> => {
  const provider = pickProvider()
  if (provider === "none") return null

  // Build a "user message" that pins the passage, then the running chat.
  const contextHeader = [
    `Highlighted passage:`,
    `"""${input.passage.slice(0, 4000)}"""`,
    input.sourceUrl ? `Source URL: ${input.sourceUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const userMessage = input.userMessage.trim()

  try {
    if (provider === "anthropic") {
      const c = getAnthropic()
      if (!c) return null
      const messages: Anthropic.MessageParam[] = []
      // Seed the conversation with the highlighted passage as the first user turn.
      messages.push({ role: "user", content: contextHeader })
      messages.push({
        role: "assistant",
        content:
          "Got it — I have the passage. What would you like me to do with it?",
      })
      for (const turn of input.history) {
        messages.push({
          role: turn.role,
          content: turn.content.slice(0, 4000),
        })
      }
      messages.push({
        role: "user",
        content:
          userMessage.length > 0
            ? userMessage
            : "Summarize this passage and suggest 2-3 follow-up questions I could ask.",
      })
      const res = await c.messages.create({
        model: ANTHROPIC_SONNET,
        max_tokens: 800,
        system: SYSTEM_QUOTE_ASSISTANT,
        messages,
      })
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
      return text.trim() || null
    }

    // OpenRouter / OpenAI-compatible.
    const c = getOpenRouter()
    if (!c) return null
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> =
      [
        { role: "system", content: SYSTEM_QUOTE_ASSISTANT },
        { role: "user", content: contextHeader },
        {
          role: "assistant",
          content:
            "Got it — I have the passage. What would you like me to do with it?",
        },
      ]
    for (const turn of input.history) {
      messages.push({ role: turn.role, content: turn.content.slice(0, 4000) })
    }
    messages.push({
      role: "user",
      content:
        userMessage.length > 0
          ? userMessage
          : "Summarize this passage and suggest 2-3 follow-up questions I could ask.",
    })
    const res = await c.chat.completions.create({
      model: env.OPENROUTER_MODEL,
      max_tokens: 800,
      messages,
    })
    return res.choices[0]?.message?.content?.trim() || null
  } catch (err) {
    console.warn("[llm] generateQuoteAssistantReply failed:", err)
    return null
  }
}

export interface GuideStep {
  instruction: string
  x: number
  y: number
  description: string
}

const clamp01 = (n: number): number => Math.max(0.02, Math.min(0.98, n))

/**
 * Convert a free-text goal into an ordered list of normalized viewport
 * coordinates. The model output is validated before being returned.
 */
export const generateGuideSteps = async (input: {
  goal: string
  sourceUrl?: string | null
}): Promise<GuideStep[] | null> => {
  const userMessage = JSON.stringify({
    goal: input.goal.slice(0, 1000),
    sourceUrl: input.sourceUrl ?? null,
  })
  try {
    const text = await generate({
      system: SYSTEM_GUIDE_STEPS,
      user: userMessage,
      maxTokens: 900,
      tier: "smart",
      expectJson: true,
    })
    if (!text) return null
    const parsed = JSON.parse(stripFences(text)) as { steps?: unknown }
    if (!Array.isArray(parsed.steps)) return null
    const out: GuideStep[] = []
    for (const raw of parsed.steps) {
      if (typeof raw !== "object" || raw === null) continue
      const r = raw as Record<string, unknown>
      if (
        typeof r.instruction !== "string" ||
        typeof r.description !== "string" ||
        typeof r.x !== "number" ||
        typeof r.y !== "number" ||
        Number.isNaN(r.x) ||
        Number.isNaN(r.y)
      ) {
        continue
      }
      out.push({
        instruction: r.instruction.slice(0, 240),
        description: r.description.slice(0, 240),
        x: clamp01(r.x),
        y: clamp01(r.y),
      })
    }
    if (out.length === 0) return null
    return out.slice(0, 10)
  } catch (err) {
    console.warn("[llm] generateGuideSteps failed:", err)
    return null
  }
}

/**
 * OpenRouter wraps upstream provider errors and the OpenAI SDK strips most
 * of the detail by default. This logger surfaces everything the SDK gives
 * us: status, code/type, the parsed `error` payload (where the *actual*
 * provider message lives, often under `error.metadata.raw`), and the raw
 * response body as a fallback.
 */
const logOpenRouterError = (
  err: unknown,
  ctx: { model: string; expectJson: boolean },
): void => {
  if (!(err instanceof OpenAI.APIError)) {
    console.warn("[llm/openrouter] non-APIError:", err)
    return
  }
  // err.error is typed `unknown` but in practice is the parsed JSON
  // body — surface it as JSON so we don't lose nested fields.
  let errorBody: unknown = err.error
  if (errorBody === undefined) {
    // Some SDK versions stash the raw body here.
    errorBody = (err as unknown as { body?: unknown }).body
  }
  const safeStringify = (v: unknown) => {
    try {
      return JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }
  console.warn(
    [
      "[llm/openrouter] APIError",
      `  status: ${err.status}`,
      `  model:  ${ctx.model}`,
      `  json:   ${ctx.expectJson}`,
      `  code:   ${err.code ?? "(none)"}`,
      `  type:   ${err.type ?? "(none)"}`,
      `  param:  ${err.param ?? "(none)"}`,
      `  msg:    ${err.message}`,
      `  body:   ${safeStringify(errorBody)}`,
    ].join("\n"),
  )
}
