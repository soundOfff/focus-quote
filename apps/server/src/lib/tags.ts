import { and, eq, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { quotes, tags, tagEdges, quoteTags } from "../db/schema"
import {
  classifyQuoteIntoTags,
  proposeTagConsolidation,
} from "./llm"
import { aiFeatureEnabledForUser } from "./ai-gate"
import { tryConsume } from "./rate-limit"

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

const markCategorized = (userId: string, quoteId: string) =>
  db
    .update(quotes)
    .set({ categorizationStatus: "categorized" })
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)))

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
      // mark categorized (it lands in the Untagged bucket) so we don't retry,
      // and burn tokens on, an unfileable quote forever.
      if (!plan) return

      const valid = new Set(graphTags.map((t) => t.id))
      const attach = plan.attachTagIds.filter((id) => valid.has(id))
      const now = new Date().toISOString()

      if (attach.length > 0) {
        for (const tagId of attach) {
          await db
            .insert(quoteTags)
            .values({ userId, quoteId, tagId, userEdited: false, createdAt: now })
            .onConflictDoNothing()
        }
        await markCategorized(userId, quoteId)
        return
      }

      if (plan.newTag) {
        const tagId = randomUUID()
        await db.insert(tags).values({
          id: tagId,
          userId,
          name: plan.newTag.slice(0, 60),
          userEdited: false,
          createdAt: now,
          updatedAt: now,
        })
        await db
          .insert(quoteTags)
          .values({ userId, quoteId, tagId, userEdited: false, createdAt: now })
          .onConflictDoNothing()
        await markCategorized(userId, quoteId)
        return
      }
      // The model returned a definitive empty plan — file it as processed
      // (Untagged) so we don't retry an unfileable quote forever.
      await markCategorized(userId, quoteId)
    })
  } catch (err) {
    console.warn("[tags] categorize failed for", quoteId, err)
  }
}

export interface ConsolidateResult {
  merged: number
  renamed: number
  reparented: number
  deleted: number
  requotesRefiled: number
}

const emptyResult = (): ConsolidateResult => ({
  merged: 0,
  renamed: 0,
  reparented: 0,
  deleted: 0,
  requotesRefiled: 0,
})

/**
 * The manual Consolidation pass (ADR 0003). Asks Haiku for a restructuring plan
 * over the whole graph and applies it defensively: never touches a userEdited
 * (pinned) Tag, validates every id, and cycle-checks every new edge. Merges
 * re-file the merged Tag's quotes onto the survivor before deleting it.
 */
export const consolidateGraph = async (
  userId: string,
): Promise<ConsolidateResult> => {
  try {
    if (!(await aiFeatureEnabledForUser(userId, "tagConsolidation"))) {
      return emptyResult()
    }
    // Heavier than a per-Save pass — charge more of the bucket.
    if (!tryConsume(userId, 3)) return emptyResult()

    return await withUserLock(userId, async () => {
      const result = emptyResult()
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

      // Renames — skip pinned tags, unknown ids, and no-ops.
      for (const r of plan.renames) {
        const t = byId.get(r.id)
        if (!t || pinned.has(r.id)) continue
        const name = r.name.trim().slice(0, 60)
        if (!name || name === t.name) continue
        await db
          .update(tags)
          .set({ name, updatedAt: now })
          .where(and(eq(tags.id, r.id), eq(tags.userId, userId)))
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
