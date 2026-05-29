import { and, asc, eq } from "drizzle-orm"
import { db } from "../db/client"
import { focusSessions, sessionUrls, userSettings } from "../db/schema"
import { aiFeatureEnabledForUser } from "./ai-gate"
import {
  generateRecallQuestions,
  generateResourceRecommendations,
  generateStudyTips,
  type RecallOptions,
  type RecallQuestion,
  type ResourceRecommendation,
} from "./llm"

const loadRecallOptions = async (userId: string): Promise<RecallOptions & { auto: boolean }> => {
  const [row] = await db
    .select({
      recallQuestionCount: userSettings.recallQuestionCount,
      recallDepth: userSettings.recallDepth,
      recallAutoGenerate: userSettings.recallAutoGenerate,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  if (!row) return { auto: true, count: 5, depth: "standard" }
  const count =
    typeof row.recallQuestionCount === "number" &&
    Number.isFinite(row.recallQuestionCount)
      ? Math.max(1, Math.min(15, Math.floor(row.recallQuestionCount)))
      : 5
  const depth =
    row.recallDepth === "easy" || row.recallDepth === "challenging"
      ? row.recallDepth
      : "standard"
  return {
    auto: row.recallAutoGenerate,
    count,
    depth,
  }
}

/**
 * Same pattern as `maybeGenerateSummary`: read goal + URLs, call the LLM,
 * persist JSON. Skips if already cached, or if the session has no URLs.
 * Fire-and-forget — callers should `void` these.
 */

type Artifact = "studyTips" | "recallQuestions" | "resourceRecommendations"

const loadInput = async (userId: string, sessionId: string) => {
  const [session] = await db
    .select({
      id: focusSessions.id,
      goal: focusSessions.goal,
      studyTips: focusSessions.studyTips,
      recallQuestions: focusSessions.recallQuestions,
      resourceRecommendations: focusSessions.resourceRecommendations,
    })
    .from(focusSessions)
    .where(
      and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
    )
    .limit(1)
  if (!session) return null

  const urls = await db
    .select({
      url: sessionUrls.url,
      title: sessionUrls.title,
      category: sessionUrls.category,
    })
    .from(sessionUrls)
    .where(
      and(
        eq(sessionUrls.sessionId, sessionId),
        eq(sessionUrls.userId, userId),
      ),
    )
    .orderBy(asc(sessionUrls.visitedAt))
    .limit(60)

  return { session, urls }
}

const persistArtifact = async (
  userId: string,
  sessionId: string,
  artifact: Artifact,
  value: unknown,
): Promise<void> => {
  const json = JSON.stringify(value)
  if (artifact === "studyTips") {
    await db
      .update(focusSessions)
      .set({ studyTips: json })
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
  } else if (artifact === "recallQuestions") {
    await db
      .update(focusSessions)
      .set({ recallQuestions: json })
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
  } else {
    await db
      .update(focusSessions)
      .set({ resourceRecommendations: json })
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
  }
}

const maybeGenerate = async (
  userId: string,
  sessionId: string,
  artifact: Artifact,
  opts: { force?: boolean; onDemand?: boolean } = {},
): Promise<void> => {
  try {
    // Master AI gate (ADR 0002): never spend tokens for a disabled feature,
    // even on an explicit force-regenerate.
    if (!(await aiFeatureEnabledForUser(userId, artifact))) return
    const ctx = await loadInput(userId, sessionId)
    if (!ctx) return
    if (!opts.force && ctx.session[artifact]) return // cached
    if (ctx.urls.length === 0) return

    const input = { goal: ctx.session.goal, urls: ctx.urls }
    let result: unknown | null = null
    if (artifact === "studyTips") {
      result = await generateStudyTips(input)
    } else if (artifact === "recallQuestions") {
      const recall = await loadRecallOptions(userId)
      // The per-feature "Recall questions" gate (checked above) is the single
      // on/off switch. `auto` only governs *when* we spend tokens: on, we
      // generate at session end; off, we defer until the user opens the
      // session-detail page (onDemand) or hits Regenerate (force).
      if (!opts.force && !opts.onDemand && !recall.auto) return
      result = await generateRecallQuestions(input, {
        count: recall.count,
        depth: recall.depth,
      })
    } else {
      result = await generateResourceRecommendations(input)
    }
    if (!result) return
    await persistArtifact(userId, sessionId, artifact, result)
  } catch (err) {
    console.warn(`[study-artifacts] ${artifact} failed for`, sessionId, err)
  }
}

export const forceRegenerate = (
  userId: string,
  sessionId: string,
  artifact: Artifact,
) => maybeGenerate(userId, sessionId, artifact, { force: true })

export type ArtifactKind = Artifact

export const maybeGenerateStudyTips = (userId: string, sessionId: string) =>
  maybeGenerate(userId, sessionId, "studyTips")

export const maybeGenerateRecallQuestions = (
  userId: string,
  sessionId: string,
  opts: { onDemand?: boolean } = {},
) => maybeGenerate(userId, sessionId, "recallQuestions", opts)

export const maybeGenerateResourceRecommendations = (
  userId: string,
  sessionId: string,
) => maybeGenerate(userId, sessionId, "resourceRecommendations")

// Typed readers — parse the JSON blobs back to runtime types.
export const parseStudyTips = (raw: string | null): string[] | null => {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    return arr.filter((s): s is string => typeof s === "string")
  } catch {
    return null
  }
}

export const parseRecallQuestions = (
  raw: string | null,
): RecallQuestion[] | null => {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    return arr.filter(
      (x): x is RecallQuestion =>
        typeof x === "object" &&
        x !== null &&
        typeof x.q === "string" &&
        typeof x.a === "string",
    )
  } catch {
    return null
  }
}

export const parseResourceRecommendations = (
  raw: string | null,
): ResourceRecommendation[] | null => {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    return arr.filter(
      (x): x is ResourceRecommendation =>
        typeof x === "object" &&
        x !== null &&
        typeof x.url === "string" &&
        typeof x.title === "string" &&
        typeof x.why === "string",
    )
  } catch {
    return null
  }
}
