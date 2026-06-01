import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { generateJobAnswer } from "../lib/llm"
import { aiFeatureEnabledForUser } from "../lib/ai-gate"
import { tryConsume } from "../lib/rate-limit"
import { GenerateJobAnswerInput } from "../lib/api-schemas"

/**
 * Job Application answer drafting.
 *
 * STATELESS PASSTHROUGH (docs/adr/0004-local-only-job-application-data.md): the
 * CV and Answer Bank arrive in the request body from the extension's LOCAL
 * storage, are used only to build the LLM prompt, and are never logged or
 * persisted. Do not add request-body logging or any DB write here.
 */
export const jobsRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .post("/generate-answer", zValidator("json", GenerateJobAnswerInput), async (c) => {
    const userId = c.get("user").id
    // Server-side AI gate (ADR 0002): never spend tokens for a disabled feature.
    if (!(await aiFeatureEnabledForUser(userId, "jobAnswer"))) {
      return c.json({ error: "AI is turned off", code: "AI_DISABLED" }, 403)
    }
    // Smart-tier model + CV in the prompt — throttle per user.
    if (!tryConsume(userId)) {
      return c.json({ error: "Too many requests", code: "RATE_LIMITED" }, 429)
    }
    const body = c.req.valid("json")
    const result = await generateJobAnswer({
      question: body.question,
      cv: body.cv,
      answerBank: body.answerBank,
      company: body.company ?? null,
    })
    if (!result) {
      return c.json(
        { error: "AI provider unavailable", code: "LLM_UNAVAILABLE" },
        503,
      )
    }
    return c.json({ answer: result.answer, contextual: result.contextual })
  })
