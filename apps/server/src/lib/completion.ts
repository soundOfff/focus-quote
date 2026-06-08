import { and, eq } from "drizzle-orm"
import { db } from "../db/client"
import { focusSessions } from "../db/schema"
import { aiFeatureEnabledForUser } from "./ai-gate"
import { maybeGenerateSummary } from "./summary"
import {
  maybeGenerateRecallQuestions,
  maybeGenerateResourceRecommendations,
  maybeGenerateStudyTips,
} from "./study-artifacts"
import {
  maybeAutoDeriveGoal,
  maybeGenerateTitle,
  maybeGenerateTopic,
} from "./topic"
import { flushPendingSessionVault } from "./vault"

/**
 * The two-phase session-completion pipeline (ADR-0004). The single downstream
 * path shared by every caller that marks a session complete (the sync batch and
 * the direct upsert), so completion behaves identically however a session ends.
 *
 * Phase 1 (parallel, immediate): the Vault-independent artifacts — Summary and
 *   Study tips — start right away; they need only the goal + visited URLs.
 * Phase 2 (sequential): resolve the Topic, flush the pending Session Vault into
 *   it, and *only then* generate the Vault-aware artifacts — Resource
 *   recommendations and Recall questions — so they read a resolved Topic and a
 *   promoted Vault (the user's already-known set) on first view.
 *
 * The Phase 2 ordering is deliberate and MUST NOT be re-parallelized (ADR-0004):
 * generation is background/fire-and-forget so the added latency is invisible,
 * and correctness of the known-set on first view is what matters. The two
 * phases run concurrently with each other — only Phase 2 is internally ordered.
 *
 * Every step is self-gating + fail-open, so this is safe to `void` from any
 * caller; the returned promise settles once all generation has been kicked off
 * and the ordered steps have completed.
 */
export const runCompletionDownstream = async (
  userId: string,
  sessionId: string,
): Promise<void> => {
  // Phase 1 — Vault-independent. Kick off in parallel and don't gate Phase 2 on
  // it; these never read the Topic or Vault.
  const phase1 = Promise.all([
    maybeGenerateSummary(userId, sessionId),
    maybeGenerateStudyTips(userId, sessionId),
  ])

  // Phase 2 — strictly sequential: label + Topic resolve → Vault flush →
  // Vault-aware generation.
  const phase2 = (async () => {
    const [session] = await db
      .select({ goal: focusSessions.goal })
      .from(focusSessions)
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
      .limit(1)
    if (!session) return

    // When the user set no goal, one of two AI fillers labels the session: an
    // opt-in auto-Title (issue #9) or, by default, an auto-derived Goal. Only
    // one runs so we never double-spend or compete for the label.
    const hasGoal = (session.goal ?? "").trim().length > 0
    const autoTitle =
      !hasGoal && (await aiFeatureEnabledForUser(userId, "autoTitle"))
    if (!hasGoal && !autoTitle) await maybeAutoDeriveGoal(userId, sessionId)

    // Topic feeds the title prompt, so resolve it before deriving the title.
    await maybeGenerateTopic(userId, sessionId)
    if (autoTitle) await maybeGenerateTitle(userId, sessionId)

    // Topic is now resolved (or stayed empty) — promote any vault items the user
    // saved during the session into its topic, falling back to "Uncategorized"
    // so nothing saved mid-session is ever lost.
    await flushPendingSessionVault(userId, sessionId)

    // Topic resolved + Vault flushed: only now may the Vault-aware artifacts run.
    await Promise.all([
      maybeGenerateRecallQuestions(userId, sessionId),
      maybeGenerateResourceRecommendations(userId, sessionId),
    ])
  })()

  await Promise.all([phase1, phase2])
}
