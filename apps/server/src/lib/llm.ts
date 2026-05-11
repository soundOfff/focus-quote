import Anthropic from "@anthropic-ai/sdk"
import { env } from "../env"

const HAIKU = "claude-haiku-4-5-20251001"
const SONNET = "claude-sonnet-4-5-20250929"

const SYSTEM_CLASSIFY = `You are a focus coach helping a user stay on task.
For each URL the user visits during a focus session, you respond with strict JSON:
{"category": string, "distractionScore": integer 0-100, "nudge": string | null}

- "category" examples: "work", "research", "social", "news", "entertainment", "shopping", "tools".
- "distractionScore": 0 means perfectly on-goal, 100 means major distraction.
- "nudge": only set when distractionScore >= 70. ONE short, kind sentence in the user's language pulling them back. Otherwise null.

Reply with ONLY the JSON object, no prose, no markdown fences.`

const SYSTEM_SUMMARY = `You are a focus coach summarizing a completed session.
You receive the session goal and the list of URLs visited (with categories).
Reply with strict JSON: {"summary": string} containing 2-3 short sentences in the user's language reviewing what they did, on-goal vs off-goal patterns, and one actionable tip.
No prose outside JSON, no markdown fences.`

let client: Anthropic | null = null
const getClient = (): Anthropic | null => {
  if (!env.ANTHROPIC_API_KEY) return null
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
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
  const c = getClient()
  if (!c) return null

  const userMessage = JSON.stringify({
    goal: input.goal ?? "(no explicit goal)",
    url: input.url,
    title: input.title ?? "",
  })

  try {
    const res = await c.messages.create({
      model: HAIKU,
      max_tokens: 200,
      system: [
        {
          type: "text",
          text: SYSTEM_CLASSIFY,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    })
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
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

export const summarizeSession = async (input: {
  goal: string | null
  urls: Array<{ url: string; category: string | null; title: string | null }>
}): Promise<string | null> => {
  const c = getClient()
  if (!c) return null
  if (input.urls.length === 0) return null

  const userMessage = JSON.stringify({
    goal: input.goal ?? "(no explicit goal)",
    urls: input.urls.slice(0, 60),
  })

  try {
    const res = await c.messages.create({
      model: SONNET,
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: SYSTEM_SUMMARY,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    })
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
    const parsed = JSON.parse(stripFences(text)) as { summary?: string }
    return typeof parsed.summary === "string" ? parsed.summary : null
  } catch (err) {
    console.warn("[llm] summarizeSession failed:", err)
    return null
  }
}

const stripFences = (s: string): string =>
  s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
