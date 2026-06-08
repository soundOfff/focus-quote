import { maybeGenerateSummary } from "./summary"
import {
  maybeGenerateRecallQuestions,
  maybeGenerateResourceRecommendations,
  maybeGenerateStudyTips,
} from "./study-artifacts"
import { maybeGenerateTitle, maybeGenerateTopic } from "./topic"
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

  // Phase 2 — strictly sequential: Topic resolve → label → Vault flush →
  // Vault-aware generation.
  const phase2 = (async () => {
    // Topic feeds the Title prompt and scopes the Vault, so resolve it first.
    await maybeGenerateTopic(userId, sessionId)

    // The only AI-authored Session label is an opt-in auto-Title, applied when
    // the user set no Goal (ADR-0004 / glossary): the AI never authors a Goal.
    // maybeGenerateTitle self-gates on the autoTitle feature + an empty goal, so
    // calling it unconditionally is a no-op otherwise.
    await maybeGenerateTitle(userId, sessionId)

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
