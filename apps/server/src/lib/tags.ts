import { and, eq, isNull, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { quotes, tags, tagEdges, quoteTags } from "../db/schema"
import {
  classifyQuoteIntoTags,
  classifyQuotesIntoTagsBatch,
  proposeTagConsolidation,
  type QuoteTagClassification,
} from "./llm"
import { aiFeatureEnabledForUser } from "./ai-gate"
import { tryConsume } from "./rate-limit"
import type { ConsolidateProgressEvent } from "@focus-quote/shared"

// ADR 0003: the server owns the AI-maintained Tag graph. The per-Save Haiku
// pass only ATTACHES a quote (creating one Tag if nothing fits); the error-prone
// restructuring (merge / rename / re-parent) is concentrated into the manual
// Consolidation pass. User-created/edited Tags and memberships are pinned
// (userEdited) and never overridden by the autonomous curator.

// ---- per-user serialization (ADR 0003: "graph mutations serialized per user") ----
// A process-local promise chain per user so the per-Save categorizer never races
// the Consolidation pass. Single-instance MVP; swap for a distributed lock later.
const chains = new Map<string, Promise<unknown>>()
const withUserLock = <T>(userId: string, fn: () => Promise<T>): Promise<T> => {
  const prev = (chains.get(userId) ?? Promise.resolve()).catch(() => {})
  const run = prev.then(fn)
  chains.set(
    userId,
    run.catch(() => {}),
  )
  return run
}

export interface GraphSnapshot {
  tags: Array<{
    id: string
    name: string
    userEdited: boolean
    createdAt: string
    updatedAt: string
  }>
  edges: Array<{ parentId: string; childId: string; userEdited: boolean }>
  memberships: Array<{ quoteId: string; tagId: string; userEdited: boolean }>
}

/** The whole graph read-model for a user (tags + edges + quote memberships). */
export const loadTagGraph = async (userId: string): Promise<GraphSnapshot> => {
  const [tagRows, edgeRows, memberRows] = await Promise.all([
    db
      .select({
        id: tags.id,
        name: tags.name,
        userEdited: tags.userEdited,
        createdAt: tags.createdAt,
        updatedAt: tags.updatedAt,
      })
      .from(tags)
      .where(eq(tags.userId, userId)),
    db
      .select({
        parentId: tagEdges.parentId,
        childId: tagEdges.childId,
        userEdited: tagEdges.userEdited,
      })
      .from(tagEdges)
      .where(eq(tagEdges.userId, userId)),
    db
      .select({
        quoteId: quoteTags.quoteId,
        tagId: quoteTags.tagId,
        userEdited: quoteTags.userEdited,
      })
      .from(quoteTags)
      .where(eq(quoteTags.userId, userId)),
  ])
  return { tags: tagRows, edges: edgeRows, memberships: memberRows }
}

/**
 * Would adding parent->child close a cycle? True if `child` can already reach
 * `parent` by following parent->child edges (or they are the same node).
 */
const wouldCreateCycle = (
  edges: ReadonlyArray<{ parentId: string; childId: string }>,
  parentId: string,
  childId: string,
): boolean => {
  if (parentId === childId) return true
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    const list = adj.get(e.parentId)
    if (list) list.push(e.childId)
    else adj.set(e.parentId, [e.childId])
  }
  const stack = [childId]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node === parentId) return true
    if (seen.has(node)) continue
    seen.add(node)
    for (const next of adj.get(node) ?? []) stack.push(next)
  }
  return false
}

/** Fold a Tag name for dedup: trimmed, whitespace-collapsed, case-insensitive. */
const normalizeTagName = (name: string): string =>
  name.trim().replace(/\s+/g, " ").toLowerCase()

const markCategorized = (userId: string, quoteId: string) =>
  db
    .update(quotes)
    .set({ categorizationStatus: "categorized" })
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)))

/**
 * Apply a classifier plan to a single quote: attach to the fitting existing
 * Tags, else mint the one proposed Tag, else mark it processed (it lands in the
 * Untagged bucket so we don't retry an unfileable quote forever). `liveTags` is
 * the in-scope Tag list; a minted Tag is appended to it so a batch caller can
 * reuse it for the next quote in the same pass. Returns what happened.
 */
const applyClassification = async (
  userId: string,
  quoteId: string,
  plan: QuoteTagClassification,
  liveTags: Array<{ id: string; name: string }>,
): Promise<{ attached: number; createdTag: boolean }> => {
  const now = new Date().toISOString()
  const valid = new Set(liveTags.map((t) => t.id))
  const attach = plan.attachTagIds.filter((id) => valid.has(id))

  if (attach.length > 0) {
    for (const tagId of attach) {
      await db
        .insert(quoteTags)
        .values({ userId, quoteId, tagId, userEdited: false, createdAt: now })
        .onConflictDoNothing()
    }
    await markCategorized(userId, quoteId)
    return { attached: attach.length, createdTag: false }
  }

  if (plan.newTag) {
    const name = plan.newTag.trim().slice(0, 60)
    if (name) {
      // Before minting, reuse a same-named Tag if one already exists (the model
      // sometimes proposes a "new" Tag whose name matches an existing one,
      // case/whitespace aside). Minting anyway would leave two Tags — and two
      // graph nodes — under one label. Attach to the existing Tag instead.
      const norm = normalizeTagName(name)
      const existing = liveTags.find((t) => normalizeTagName(t.name) === norm)
      const tagId = existing ? existing.id : randomUUID()
      if (!existing) {
        await db.insert(tags).values({
          id: tagId,
          userId,
          name,
          userEdited: false,
          createdAt: now,
          updatedAt: now,
        })
        liveTags.push({ id: tagId, name })
      }
      await db
        .insert(quoteTags)
        .values({ userId, quoteId, tagId, userEdited: false, createdAt: now })
        .onConflictDoNothing()
      await markCategorized(userId, quoteId)
      return { attached: 1, createdTag: !existing }
    }
  }

  // The model returned a definitive empty plan — file it as processed.
  await markCategorized(userId, quoteId)
  return { attached: 0, createdTag: false }
}

/**
 * Per-Save Haiku categorizer (ADR 0003). Files a single pending quote into the
 * Tag graph: attach to fitting existing Tags, else create one new Tag. Skips a
 * quote that already carries a (pinned) manual tag. Gated by the `quoteTagging`
 * feature and rate-limited — when the bucket is empty the quote simply stays
 * pending and is retried on a later sync. Fail-open everywhere.
 */
export const maybeCategorizeQuote = async (
  userId: string,
  quoteId: string,
): Promise<void> => {
  try {
    if (!(await aiFeatureEnabledForUser(userId, "quoteTagging"))) return
    // Bursty per-Save call — cap it (CLAUDE.md AI-call guidance). On miss the
    // quote stays "pending" for the next drain rather than spending tokens now.
    if (!tryConsume(userId)) return

    await withUserLock(userId, async () => {
      const [quote] = await db
        .select({
          id: quotes.id,
          text: quotes.text,
          status: quotes.categorizationStatus,
        })
        .from(quotes)
        .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)))
        .limit(1)
      if (!quote) return
      if (quote.status !== "pending") return

      // Manual tagging already filed (and pinned) this quote — respect it.
      const existing = await db
        .select({ tagId: quoteTags.tagId })
        .from(quoteTags)
        .where(
          and(eq(quoteTags.quoteId, quoteId), eq(quoteTags.userId, userId)),
        )
        .limit(1)
      if (existing.length > 0) {
        await markCategorized(userId, quoteId)
        return
      }

      const graphTags = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(eq(tags.userId, userId))

      const plan = await classifyQuoteIntoTags({
        text: quote.text,
        tags: graphTags,
      })
      // null = model unavailable: leave pending so a later sweep retries it.
      // A non-null-but-empty plan means the model deliberately filed nothing —
      // applyClassification marks it categorized (it lands in the Untagged
      // bucket) so we don't retry, and burn tokens on, an unfileable quote.
      if (!plan) return
      await applyClassification(userId, quoteId, plan, graphTags)
    })
  } catch (err) {
    console.warn("[tags] categorize failed for", quoteId, err)
  }
}

export interface ConsolidateResult {
  /** Untagged quotes the filing step just filed under a Tag. */
  filed: number
  merged: number
  renamed: number
  reparented: number
  deleted: number
  requotesRefiled: number
}

const emptyResult = (): ConsolidateResult => ({
  filed: 0,
  merged: 0,
  renamed: 0,
  reparented: 0,
  deleted: 0,
  requotesRefiled: 0,
})

// Most untagged quotes one "Tidy now" will file in a single pass. The whole
// sweep is ONE batched LLM call, so keep the batch modest — bounds prompt size
// and keeps the progress bar quick; the rest are filed on the next click (and
// the Untagged count keeps showing what's left).
const UNTAGGED_SWEEP_CAP = 30

/**
 * Tidy's filing step (the user-visible point of "Tidy now"): sweep quotes that
 * carry no Tag at all through the batched Haiku classifier so the Untagged
 * bucket actually clears — the restructuring pass below only reshapes *existing*
 * Tags and never files a loose quote. Freshly-captured (pending) quotes are
 * filed before already-processed ones so a backlog never starves new captures.
 *
 * The cost lever: the whole batch goes through the model in ONE round-trip
 * (reasoning models bill mostly for hidden reasoning tokens, so one shared pass
 * for up to UNTAGGED_SWEEP_CAP quotes is ~10x cheaper than one call per quote).
 * Charges a single rate-limit token. We then apply the results one quote at a
 * time and emit a progress frame after each so the bar fills smoothly. A minted
 * Tag is reused for later quotes in the same batch. Must run inside the per-user
 * lock. Fail-soft: a null plan or unechoed id just leaves that quote for next Tidy.
 */
const categorizeUntaggedQuotes = async (
  userId: string,
  onProgress?: (e: ConsolidateProgressEvent) => Promise<void> | void,
): Promise<number> => {
  const untagged = await db
    .select({
      id: quotes.id,
      text: quotes.text,
      status: quotes.categorizationStatus,
    })
    .from(quotes)
    .leftJoin(
      quoteTags,
      and(eq(quoteTags.quoteId, quotes.id), eq(quoteTags.userId, userId)),
    )
    .where(and(eq(quotes.userId, userId), isNull(quoteTags.quoteId)))
  if (untagged.length === 0) return 0

  untagged.sort((a, b) =>
    a.status === b.status ? 0 : a.status === "pending" ? -1 : 1,
  )
  const batch = untagged.slice(0, UNTAGGED_SWEEP_CAP)

  // One batched call for the whole sweep — charge a single token; if the bucket
  // is dry, leave the batch for the next Tidy.
  if (!tryConsume(userId)) return 0

  // The live Tag list, grown in-memory as we mint new Tags so a later quote in
  // this same batch reuses one an earlier quote just created.
  const liveTags = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.userId, userId))

  await onProgress?.({ phase: "classifying", total: batch.length })
  const plans = await classifyQuotesIntoTagsBatch({
    quotes: batch.map((q) => ({ id: q.id, text: q.text })),
    tags: liveTags,
  })
  if (!plans) return 0 // model unavailable — leave the batch for the next Tidy
  const byId = new Map(plans.map((p) => [p.id, p]))

  let filed = 0
  let processed = 0
  for (const q of batch) {
    const plan = byId.get(q.id)
    if (plan) {
      const { attached } = await applyClassification(userId, q.id, plan, liveTags)
      if (attached > 0) filed++
    }
    processed++
    await onProgress?.({ phase: "filing", processed, total: batch.length })
  }
  return filed
}

/**
 * The manual "Tidy now" pass (ADR 0003). Two steps, both user-triggered:
 *   1. Filing — sweep Untagged quotes through the classifier (the visible win).
 *   2. Restructuring — ask Haiku for a graph plan (merge / rename / re-parent)
 *      and apply it defensively: never touch a userEdited (pinned) Tag, validate
 *      every id, cycle-check every new edge, and re-file a merged Tag's quotes
 *      onto the survivor before deleting it.
 * Each step is independently gated (quoteTagging / tagConsolidation) so turning
 * one feature off still runs the other.
 */
export const consolidateGraph = async (
  userId: string,
  onProgress?: (e: ConsolidateProgressEvent) => Promise<void> | void,
): Promise<ConsolidateResult> => {
  try {
    const canFile = await aiFeatureEnabledForUser(userId, "quoteTagging")
    const canTidy = await aiFeatureEnabledForUser(userId, "tagConsolidation")
    if (!canFile && !canTidy) return emptyResult()

    return await withUserLock(userId, async () => {
      const result = emptyResult()

      // 1) Filing step — clear the Untagged bucket via one batched call, then
      //    stream a frame per applied quote (see categorizeUntaggedQuotes).
      if (canFile) result.filed = await categorizeUntaggedQuotes(userId, onProgress)

      // 2) Restructuring step — heavier than a per-Save pass, so charge more of
      //    the bucket. If filing drained it, skip restructuring this round; the
      //    filing already helped and the next click (after refill) reshapes.
      if (!canTidy) return result
      if (!tryConsume(userId, 3)) return result
      await onProgress?.({ phase: "restructuring" })

      const tagRows = await db
        .select({ id: tags.id, name: tags.name, userEdited: tags.userEdited })
        .from(tags)
        .where(eq(tags.userId, userId))
      if (tagRows.length < 2) return result

      const countRows = await db
        .select({ tagId: quoteTags.tagId, n: sql<number>`count(*)` })
        .from(quoteTags)
        .where(eq(quoteTags.userId, userId))
        .groupBy(quoteTags.tagId)
      const countMap = new Map(countRows.map((r) => [r.tagId, Number(r.n)]))

      const edgeRows = await db
        .select({ parentId: tagEdges.parentId, childId: tagEdges.childId })
        .from(tagEdges)
        .where(eq(tagEdges.userId, userId))

      const plan = await proposeTagConsolidation({
        tags: tagRows.map((t) => ({
          id: t.id,
          name: t.name,
          quoteCount: countMap.get(t.id) ?? 0,
        })),
        edges: edgeRows,
      })
      if (!plan) return result

      const byId = new Map(tagRows.map((t) => [t.id, t]))
      const pinned = new Set(
        tagRows.filter((t) => t.userEdited).map((t) => t.id),
      )
      let edges = edgeRows.map((e) => ({ ...e }))
      const now = new Date().toISOString()

      // Renames — skip pinned tags, unknown ids, and no-ops. Also skip when the
      // new name collides with another live Tag: renaming into it would leave two
      // same-named Tags (two graph nodes under one label). A real consolidation
      // there is the model's job via `merges`, not a rename.
      const liveNames = new Set(
        [...byId.values()].map((t) => normalizeTagName(t.name)),
      )
      for (const r of plan.renames) {
        const t = byId.get(r.id)
        if (!t || pinned.has(r.id)) continue
        const name = r.name.trim().slice(0, 60)
        if (!name || name === t.name) continue
        const norm = normalizeTagName(name)
        const prevNorm = normalizeTagName(t.name)
        if (norm !== prevNorm && liveNames.has(norm)) continue
        await db
          .update(tags)
          .set({ name, updatedAt: now })
          .where(and(eq(tags.id, r.id), eq(tags.userId, userId)))
        liveNames.delete(prevNorm)
        liveNames.add(norm)
        t.name = name
        result.renamed++
      }

      // Merges — fold fromId into intoId. Never delete a pinned (user) tag.
      for (const m of plan.merges) {
        if (m.fromId === m.intoId) continue
        if (!byId.has(m.fromId) || !byId.has(m.intoId)) continue
        if (pinned.has(m.fromId)) continue
        const moved = await db
          .select({ quoteId: quoteTags.quoteId, userEdited: quoteTags.userEdited })
          .from(quoteTags)
          .where(
            and(eq(quoteTags.userId, userId), eq(quoteTags.tagId, m.fromId)),
          )
        for (const mem of moved) {
          await db
            .insert(quoteTags)
            .values({
              userId,
              quoteId: mem.quoteId,
              tagId: m.intoId,
              // Preserve a pin when re-filing a manually-tagged quote.
              userEdited: mem.userEdited,
              createdAt: now,
            })
            .onConflictDoNothing()
          result.requotesRefiled++
        }
        // Deleting the tag cascades its edges + remaining memberships away.
        await db
          .delete(tags)
          .where(and(eq(tags.id, m.fromId), eq(tags.userId, userId)))
        byId.delete(m.fromId)
        edges = edges.filter(
          (e) => e.parentId !== m.fromId && e.childId !== m.fromId,
        )
        result.merged++
        result.deleted++
      }

      // Parents — add parent->child edges, cycle-checked, de-duplicated.
      for (const p of plan.parents) {
        if (!byId.has(p.parentId) || !byId.has(p.childId)) continue
        if (p.parentId === p.childId) continue
        if (
          edges.some(
            (e) => e.parentId === p.parentId && e.childId === p.childId,
          )
        ) {
          continue
        }
        if (wouldCreateCycle(edges, p.parentId, p.childId)) continue
        await db
          .insert(tagEdges)
          .values({
            userId,
            parentId: p.parentId,
            childId: p.childId,
            userEdited: false,
            createdAt: now,
          })
          .onConflictDoNothing()
        edges.push({ parentId: p.parentId, childId: p.childId })
        result.reparented++
      }

      return result
    })
  } catch (err) {
    console.warn("[tags] consolidate failed for", userId, err)
    return emptyResult()
  }
}

// ---- manual mutations applied from the offline sync queue (ADR 0003) ----
// Manual tag ops pin their rows (userEdited=true) so the autonomous curator
// never overrides them. Tag ids are client-generated.

export const upsertManualTag = async (
  userId: string,
  input: { id: string; name: string; createdAt: string; updatedAt: string },
): Promise<void> => {
  const name = input.name.trim().slice(0, 60)
  if (!name) throw new Error("Tag name required")
  // Tag ids are client-generated and not secret (they ride in the graph
  // read-model). Without a userId guard on the UPDATE, a client could send an
  // upsertTag job carrying *another* user's tag id and overwrite that user's
  // tag name. `setWhere` scopes the DO UPDATE to the acting user, so a row
  // owned by someone else simply no-ops (the conflicting INSERT is ignored)
  // rather than being hijacked. Mirrors the ownership guard on attachQuoteTag.
  await db
    .insert(tags)
    .values({
      id: input.id,
      userId,
      name,
      userEdited: true,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    })
    .onConflictDoUpdate({
      target: tags.id,
      set: { name, userEdited: true, updatedAt: input.updatedAt },
      setWhere: eq(tags.userId, userId),
    })
}

export const deleteTag = async (
  userId: string,
  tagId: string,
): Promise<void> => {
  // Cascade clears the tag's edges + memberships.
  await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
}

export const attachQuoteTag = async (
  userId: string,
  input: { quoteId: string; tagId: string; createdAt: string },
): Promise<void> => {
  // Both rows must belong to the user (no cross-user attach).
  const [quote] = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(and(eq(quotes.id, input.quoteId), eq(quotes.userId, userId)))
    .limit(1)
  if (!quote) throw new Error("Quote not owned by user")
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, input.tagId), eq(tags.userId, userId)))
    .limit(1)
  if (!tag) throw new Error("Tag not owned by user")
  await db
    .insert(quoteTags)
    .values({
      userId,
      quoteId: input.quoteId,
      tagId: input.tagId,
      userEdited: true,
      createdAt: input.createdAt,
    })
    .onConflictDoUpdate({
      target: [quoteTags.quoteId, quoteTags.tagId],
      set: { userEdited: true },
    })
  // A manually-filed quote is no longer pending.
  await markCategorized(userId, input.quoteId)
}

export const detachQuoteTag = async (
  userId: string,
  input: { quoteId: string; tagId: string },
): Promise<void> => {
  await db
    .delete(quoteTags)
    .where(
      and(
        eq(quoteTags.userId, userId),
        eq(quoteTags.quoteId, input.quoteId),
        eq(quoteTags.tagId, input.tagId),
      ),
    )
}
