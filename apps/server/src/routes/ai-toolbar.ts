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
