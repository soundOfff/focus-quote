import type { Tag, TagGraph } from "@focus-quote/shared"

/**
 * Pure helpers over the synced Tag-graph read-model (ADR 0003). The graph is a
 * DAG: a Tag may have several parent Tags and a Quote may carry several Tags.
 * Replaces the old flat `quote-folders.ts`. All ids are treated as plain
 * strings here (the branded ids from `@focus-quote/shared` are assignable).
 */

/** Display label for the bucket of quotes the AI hasn't filed under any Tag. */
export const UNTAGGED_LABEL = "Untagged"

/** Selection in the tree browser: a tag id, the Untagged bucket, or All. */
export type TagSelection = { kind: "all" } | { kind: "untagged" } | { kind: "tag"; tagId: string }

/** tag id -> ids of its direct child tags. */
const childIndex = (graph: TagGraph): Map<string, string[]> => {
  const m = new Map<string, string[]>()
  for (const e of graph.edges) {
    const arr = m.get(e.parentId)
    if (arr) arr.push(e.childId)
    else m.set(e.parentId, [e.childId])
  }
  return m
}

/** Tags that are not the child of any edge — the roots of the DAG. */
export const rootTagIds = (graph: TagGraph): string[] => {
  const isChild = new Set<string>(graph.edges.map((e) => e.childId))
  return graph.tags.filter((t) => !isChild.has(t.id)).map((t) => t.id)
}

/** All descendant tag ids of `tagId`, inclusive, following parent->child edges. */
export const descendantTagIds = (graph: TagGraph, tagId: string): Set<string> => {
  const children = childIndex(graph)
  const out = new Set<string>()
  const stack = [tagId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    for (const c of children.get(id) ?? []) stack.push(c)
  }
  return out
}

/** Quote ids filed under a Tag, optionally rolling up its sub-tags. */
export const quoteIdsForTag = (
  graph: TagGraph,
  tagId: string,
  includeSubTags: boolean,
): Set<string> => {
  const tagIds = includeSubTags
    ? descendantTagIds(graph, tagId)
    : new Set<string>([tagId])
  const out = new Set<string>()
  for (const m of graph.memberships) {
    if (tagIds.has(m.tagId)) out.add(m.quoteId)
  }
  return out
}

/** The Tags a given Quote carries. */
export const tagsForQuote = (graph: TagGraph, quoteId: string): Tag[] => {
  const ids = new Set<string>(
    graph.memberships.filter((m) => m.quoteId === quoteId).map((m) => m.tagId),
  )
  return graph.tags.filter((t) => ids.has(t.id))
}

/** Quote ids with no Tag membership at all — the Untagged (pending) bucket. */
export const untaggedQuoteIds = (
  graph: TagGraph,
  allQuoteIds: Iterable<string>,
): Set<string> => {
  const tagged = new Set<string>(graph.memberships.map((m) => m.quoteId))
  const out = new Set<string>()
  for (const id of allQuoteIds) if (!tagged.has(id)) out.add(id)
  return out
}

/** Find an existing Tag by case-insensitive name (manual-tagging dedup). */
export const findTagByName = (
  graph: TagGraph,
  name: string,
): Tag | undefined => {
  const norm = name.trim().toLowerCase()
  if (!norm) return undefined
  return graph.tags.find((t) => t.name.trim().toLowerCase() === norm)
}

export interface TagTreeNode {
  tag: Tag
  children: TagTreeNode[]
  /** Quotes filed directly on this Tag. */
  directCount: number
  /** Distinct quotes filed on this Tag or any descendant (roll-up). */
  rollupCount: number
}

const byName = (a: { tag: Tag }, b: { tag: Tag }) =>
  a.tag.name.localeCompare(b.tag.name, undefined, { sensitivity: "base" })

/**
 * Build the DAG as a render tree of roots → children. A Tag with several
 * parents legitimately appears under each; a `path` guard makes a cycle (which
 * the server prevents, but be defensive) terminate instead of looping forever.
 */
export const buildTagTree = (graph: TagGraph): TagTreeNode[] => {
  const children = childIndex(graph)
  const byId = new Map<string, Tag>(graph.tags.map((t) => [t.id, t]))
  const directByTag = new Map<string, Set<string>>()
  for (const m of graph.memberships) {
    const s = directByTag.get(m.tagId) ?? new Set<string>()
    s.add(m.quoteId)
    directByTag.set(m.tagId, s)
  }

  const build = (id: string, path: Set<string>): TagTreeNode | null => {
    const tag = byId.get(id)
    if (!tag) return null
    const childNodes: TagTreeNode[] = []
    if (!path.has(id)) {
      const nextPath = new Set(path)
      nextPath.add(id)
      for (const c of children.get(id) ?? []) {
        const node = build(c, nextPath)
        if (node) childNodes.push(node)
      }
    }
    childNodes.sort(byName)
    return {
      tag,
      children: childNodes,
      directCount: directByTag.get(id)?.size ?? 0,
      rollupCount: quoteIdsForTag(graph, id, true).size,
    }
  }

  return rootTagIds(graph)
    .map((id) => build(id, new Set()))
    .filter((n): n is TagTreeNode => n !== null)
    .sort(byName)
}
