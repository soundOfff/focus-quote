import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { db } from "../db/client"
import {
  focusSessions,
  sessionUrls,
  topicVaultItems,
  userSettings,
} from "../db/schema"
import { aiFeatureEnabledForUser } from "./ai-gate"
import {
  generateRecallQuestions,
  generateResourceRecommendations,
  generateStudyTips,
  type RecallOptions,
  type RecallQuestion,
  type RecallVaultNote,
  type ResourceRecommendation,
  type ResourceVaultSeed,
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
      topicId: focusSessions.topicId,
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

/**
 * Load the resolved Topic's Vault — the user's curated, already-known set
 * (ADR-0004) — restricted to the given `kinds`. Drives both Vault-aware
 * artifacts: Resource recommendations exclude/seed from it; Recall draws from
 * its notes and screenshots. Caps at the 200 most recent matching rows, so each
 * caller passes only the kinds it consumes (recall: note/image) to stop a flood
 * of one kind starving another past the cap. Callers pass [] when there is no
 * Topic yet.
 */
const loadVaultItems = async (
  userId: string,
  topicId: string,
  kinds: ReadonlyArray<string>,
) =>
  db
    .select({
      kind: topicVaultItems.kind,
      body: topicVaultItems.body,
      title: topicVaultItems.title,
      sessionId: topicVaultItems.sessionId,
    })
    .from(topicVaultItems)
    .where(
      and(
        eq(topicVaultItems.userId, userId),
        eq(topicVaultItems.topicId, topicId),
        inArray(topicVaultItems.kind, kinds),
      ),
    )
    .orderBy(desc(topicVaultItems.createdAt))
    .limit(200)

type VaultItem = Awaited<ReturnType<typeof loadVaultItems>>[number]

/** A note's text, or a screenshot's caption — the recall source material (#39). */
const toRecallNote = (v: VaultItem): RecallVaultNote[] => {
  if (v.kind === "note") {
    const text = (v.body ?? "").trim()
    return text ? [{ kind: "note", text }] : []
  }
  if (v.kind === "image") {
    // Screenshots carry the caption in `title`; fall back to the source URL in
    // `body` so captionless saves (e.g. right-click "Save image", title=null)
    // still feed recall instead of contributing nothing (#39).
    const text = (v.title ?? "").trim() || (v.body ?? "").trim()
    return text ? [{ kind: "screenshot", text }] : []
  }
  return []
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

    const input = { goal: ctx.session.goal, urls: ctx.urls }

    if (artifact === "studyTips") {
      // Vault-independent (Phase 1): needs tracked visits.
      if (ctx.urls.length === 0) return
      const tips = await generateStudyTips(input)
      if (!tips) return
      await persistArtifact(userId, sessionId, artifact, tips)
      return
    }

    // Vault-aware artifacts (Phase 2, ADR-0004): read the resolved Topic's Vault
    // — the user's already-known set — so they work even with zero tracked
    // visits and can exclude/seed from what the user already saved. Each branch
    // loads only the Vault kinds it consumes (see loadVaultItems' row cap).
    const topicId = ctx.session.topicId

    if (artifact === "recallQuestions") {
      const recall = await loadRecallOptions(userId)
      // The per-feature "Recall questions" gate (checked above) is the single
      // on/off switch. `auto` only governs *when* we spend tokens: on, we
      // generate at session end; off, we defer until the user opens the
      // session-detail page (onDemand) or hits Regenerate (force).
      if (!opts.force && !opts.onDemand && !recall.auto) return
      // #39: draw recall from the Topic's Vault notes + screenshot captions.
      // Load only those kinds so a flood of saved URLs can't push them past the
      // row cap and starve recall of material.
      const vaultItems = topicId
        ? await loadVaultItems(userId, topicId, ["note", "image"])
        : []
      const vault = vaultItems.flatMap(toRecallNote)
      if (ctx.urls.length === 0 && vault.length === 0) return
      const questions = await generateRecallQuestions(input, {
        count: recall.count,
        depth: recall.depth,
        vault,
      })
      if (!questions) return
      await persistArtifact(userId, sessionId, artifact, questions)
      return
    }

    // resourceRecommendations (#38). Layer A: never recommend a URL already in
    // the Topic Vault (topic scope) or already visited this session — done in
    // code below + inside the generator. Layer B: seed novelty from *this
    // session's* Vault saves (session scope).
    const vaultItems = topicId
      ? await loadVaultItems(userId, topicId, ["url", "image", "note"])
      : []
    if (ctx.urls.length === 0 && vaultItems.length === 0) return
    const excludeUrls = vaultItems
      // url items hold the page URL; image items hold their source page URL in
      // `body` (schema) — both are part of the already-known set to exclude.
      .filter((v) => v.kind === "url" || v.kind === "image")
      .map((v) => v.body)
    const seed: ResourceVaultSeed[] = vaultItems
      .filter((v) => v.sessionId === sessionId)
      .map((v) => ({ kind: v.kind, body: v.body, title: v.title }))
    const resources = await generateResourceRecommendations(input, {
      excludeUrls,
      vault: seed,
    })
    if (!resources) return
    await persistArtifact(userId, sessionId, artifact, resources)
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
