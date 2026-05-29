/**
 * Catalog of token-spending AI features and the tier that sets each one's
 * default. `isAiFeatureEnabled` is the single gate that decides whether a
 * feature may spend tokens — consult it before any AI call. See ADR 0002
 * (tiered AI feature defaults).
 */

export type AiFeature =
  | "distractionDetection"
  | "sessionSummary"
  | "studyTips"
  | "recallQuestions"
  | "resourceRecommendations"
  | "quoteAssistant"
  | "guideMe"
  | "recallGrading"
  | "autoTitle"
  // ADR 0003: per-Save Haiku that files a captured Quote into the Tag graph.
  | "quoteTagging"
  // ADR 0003: the manual "Tidy now" Consolidation pass (merge/rename/re-parent).
  | "tagConsolidation"

/**
 * - `core`: on by default; the product's baseline value.
 * - `onDemand`: enabled by default but only ever runs when the user invokes it.
 * - `auto`: off by default; opt-in because it would spend tokens unprompted.
 */
export type AiTier = "core" | "onDemand" | "auto"

export const AI_FEATURE_TIERS: Record<AiFeature, AiTier> = {
  distractionDetection: "core",
  sessionSummary: "onDemand",
  studyTips: "onDemand",
  recallQuestions: "onDemand",
  resourceRecommendations: "onDemand",
  quoteAssistant: "onDemand",
  guideMe: "onDemand",
  recallGrading: "onDemand",
  autoTitle: "auto",
  // Default-ON so capture auto-files into the graph (ADR 0003). Bursty, so the
  // server rate-limits it per the AI-call guidance in CLAUDE.md.
  quoteTagging: "core",
  // Only ever runs when the user clicks "Tidy now".
  tagConsolidation: "onDemand",
}

/** Whether a feature is enabled by default, derived from its tier alone. */
export const aiFeatureDefault = (feature: AiFeature): boolean =>
  AI_FEATURE_TIERS[feature] !== "auto"

export interface AiGateSettings {
  /** Master switch. When false, every AI feature is disabled. */
  masterEnabled: boolean
  /** Per-feature overrides; an absent feature falls back to its tier default. */
  featureOverrides?: Partial<Record<AiFeature, boolean>>
}

/**
 * The gate. A feature may spend tokens only when the master switch is on AND
 * the feature's override (or, absent an override, its tier default) is on.
 */
export const isAiFeatureEnabled = (
  feature: AiFeature,
  settings: AiGateSettings,
): boolean => {
  if (!settings.masterEnabled) return false
  const override = settings.featureOverrides?.[feature]
  return override ?? aiFeatureDefault(feature)
}
