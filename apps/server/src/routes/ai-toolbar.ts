import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import {
  generateGuideSteps,
  generateQuoteAssistantReply,
} from "../lib/llm"
import { aiFeatureEnabledForUser } from "../lib/ai-gate"
import { tryConsume } from "../lib/rate-limit"

/**
 * Server-proxied AI endpoints powering the in-page focus toolbar
 * (Quote+AI and Guide Me). Keeping the Anthropic key off the client is the
 * primary motivation — see [`apps/extension/src/content/toolbar/api.ts`].
 */

const QuoteAssistantInput = z
  .object({
    // Optional so whole-page mode (no highlight) is allowed; `.refine` below
    // still requires SOME context. `pageContent` carries the full page text
    // when the user didn't highlight anything.
    passage: z.string().max(8000).optional(),
    pageContent: z.string().max(20000).nullable().optional(),
    sourceUrl: z.string().max(2048).nullable().optional(),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(4000),
        }),
      )
      .max(20)
      .optional(),
    userMessage: z.string().max(2000).optional(),
  })
  .refine(
    (b) =>
      (b.passage?.trim().length ?? 0) > 0 ||
      (b.pageContent?.trim().length ?? 0) > 0,
    { message: "Either passage or pageContent is required" },
  )

// One real interactive element captured from the user's page. `label`/`role`
// are untrusted page text; lengths are capped so a hostile page can't bloat the
// LLM prompt. `value` is intentionally absent — the client never sends it.
const GuidePageElementInput = z.object({
  ref: z.number().int().min(0).max(10_000),
  role: z.string().max(40),
  label: z.string().max(200),
  x: z.number().finite(),
  y: z.number().finite(),
})

const GuideStepsInput = z.object({
  goal: z.string().min(1).max(500),
  sourceUrl: z.string().max(2048).nullable().optional(),
  pageContext: z
    .object({
      title: z.string().max(300),
      viewport: z.object({
        w: z.number().finite(),
        h: z.number().finite(),
      }),
      elements: z.array(GuidePageElementInput).max(150),
    })
    .optional(),
})

export const aiToolbarRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .post("/quote-assistant", zValidator("json", QuoteAssistantInput), async (c) => {
    // Server-side AI gate (ADR 0002): the toolbar pre-gates client-side, but
    // we re-check here so a disabled feature never spends tokens even if a
    // request reaches us (stale prefs, a direct call, etc.).
    if (!(await aiFeatureEnabledForUser(c.get("user").id, "quoteAssistant"))) {
      return c.json({ error: "AI is turned off", code: "AI_DISABLED" }, 403)
    }
    const body = c.req.valid("json")
    const result = await generateQuoteAssistantReply({
      passage: body.passage ?? "",
      pageContent: body.pageContent ?? null,
      sourceUrl: body.sourceUrl ?? null,
      history: body.history ?? [],
      userMessage: body.userMessage ?? "",
    })
    if (!result) {
      return c.json(
        { error: "AI provider unavailable", code: "LLM_UNAVAILABLE" },
        503,
      )
    }
    return c.json({ reply: result.reply, sources: result.sources })
  })
  .post("/guide-steps", zValidator("json", GuideStepsInput), async (c) => {
    const userId = c.get("user").id
    if (!(await aiFeatureEnabledForUser(userId, "guideMe"))) {
      return c.json({ error: "AI is turned off", code: "AI_DISABLED" }, 403)
    }
    // Guide Me is one of the most expensive routes (smart-tier model + a page
    // catalog in the prompt). Throttle per user so a stale client or stolen
    // token can't spin it. See `apps/server/src/lib/rate-limit.ts`.
    if (!tryConsume(userId)) {
      return c.json({ error: "Too many requests", code: "RATE_LIMITED" }, 429)
    }
    const body = c.req.valid("json")
    const steps = await generateGuideSteps({
      goal: body.goal,
      sourceUrl: body.sourceUrl ?? null,
      pageContext: body.pageContext ?? null,
    })
    if (!steps) {
      return c.json(
        { error: "AI provider unavailable", code: "LLM_UNAVAILABLE" },
        503,
      )
    }
    return c.json({ steps })
  })
