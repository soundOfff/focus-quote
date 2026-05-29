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

/**
 * Server-proxied AI endpoints powering the in-page focus toolbar
 * (Quote+AI and Guide Me). Keeping the Anthropic key off the client is the
 * primary motivation — see [`apps/extension/src/content/toolbar/api.ts`].
 */

const QuoteAssistantInput = z.object({
  passage: z.string().min(1).max(8000),
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

const GuideStepsInput = z.object({
  goal: z.string().min(1).max(500),
  sourceUrl: z.string().max(2048).nullable().optional(),
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
    const reply = await generateQuoteAssistantReply({
      passage: body.passage,
      sourceUrl: body.sourceUrl ?? null,
      history: body.history ?? [],
      userMessage: body.userMessage ?? "",
    })
    if (!reply) {
      return c.json(
        { error: "AI provider unavailable", code: "LLM_UNAVAILABLE" },
        503,
      )
    }
    return c.json({ reply })
  })
  .post("/guide-steps", zValidator("json", GuideStepsInput), async (c) => {
    if (!(await aiFeatureEnabledForUser(c.get("user").id, "guideMe"))) {
      return c.json({ error: "AI is turned off", code: "AI_DISABLED" }, 403)
    }
    const body = c.req.valid("json")
    const steps = await generateGuideSteps({
      goal: body.goal,
      sourceUrl: body.sourceUrl ?? null,
    })
    if (!steps) {
      return c.json(
        { error: "AI provider unavailable", code: "LLM_UNAVAILABLE" },
        503,
      )
    }
    return c.json({ steps })
  })
