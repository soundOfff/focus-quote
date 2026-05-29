import { describe, it, expect } from "vitest"
import type { QuoteId, TagGraph, TagId } from "@focus-quote/shared"
import {
  UNTAGGED_LABEL,
  buildTagTree,
  descendantTagIds,
  findTagByName,
  quoteIdsForTag,
  rootTagIds,
  tagsForQuote,
  untaggedQuoteIds,
} from "@/shared/tag-graph"

const tag = (id: string, name: string) => ({
  id: id as TagId,
  name,
  userEdited: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})
const edge = (parentId: string, childId: string) => ({
  parentId: parentId as TagId,
  childId: childId as TagId,
  userEdited: false,
})
const member = (quoteId: string, tagId: string) => ({
  quoteId: quoteId as QuoteId,
  tagId: tagId as TagId,
  userEdited: false,
})

// A(root) -> B, A -> C, B -> D ; E is a standalone root.
// memberships: q1@A, q2@B, q3@D, q4@C ; q5 is untagged.
const graph: TagGraph = {
  tags: [
    tag("A", "Alpha"),
    tag("B", "Beta"),
    tag("C", "Gamma"),
    tag("D", "Delta"),
    tag("E", "Epsilon"),
  ],
  edges: [edge("A", "B"), edge("A", "C"), edge("B", "D")],
  memberships: [
    member("q1", "A"),
    member("q2", "B"),
    member("q3", "D"),
    member("q4", "C"),
  ],
}
const allQuoteIds = ["q1", "q2", "q3", "q4", "q5"]

describe("rootTagIds", () => {
  it("returns tags that are not a child of any edge", () => {
    expect(new Set(rootTagIds(graph))).toEqual(new Set(["A", "E"]))
  })
})

describe("descendantTagIds", () => {
  it("includes self and all transitive children", () => {
    expect(descendantTagIds(graph, "A")).toEqual(new Set(["A", "B", "C", "D"]))
    expect(descendantTagIds(graph, "B")).toEqual(new Set(["B", "D"]))
    expect(descendantTagIds(graph, "E")).toEqual(new Set(["E"]))
  })
})

describe("quoteIdsForTag", () => {
  it("returns only direct members without roll-up", () => {
    expect(quoteIdsForTag(graph, "A", false)).toEqual(new Set(["q1"]))
    expect(quoteIdsForTag(graph, "B", false)).toEqual(new Set(["q2"]))
  })
  it("rolls up descendant members when includeSubTags", () => {
    expect(quoteIdsForTag(graph, "A", true)).toEqual(
      new Set(["q1", "q2", "q3", "q4"]),
    )
    expect(quoteIdsForTag(graph, "B", true)).toEqual(new Set(["q2", "q3"]))
  })
})

describe("tagsForQuote", () => {
  it("returns the tags a quote carries", () => {
    expect(tagsForQuote(graph, "q3").map((t) => t.name)).toEqual(["Delta"])
    expect(tagsForQuote(graph, "q5")).toHaveLength(0)
  })
})

describe("untaggedQuoteIds", () => {
  it("returns quotes with no membership", () => {
    expect(untaggedQuoteIds(graph, allQuoteIds)).toEqual(new Set(["q5"]))
  })
  it("uses UNTAGGED_LABEL as the bucket name", () => {
    expect(UNTAGGED_LABEL).toBe("Untagged")
  })
})

describe("findTagByName", () => {
  it("matches case-insensitively and trims", () => {
    expect(findTagByName(graph, "  alpha ")?.id).toBe("A")
    expect(findTagByName(graph, "DELTA")?.id).toBe("D")
    expect(findTagByName(graph, "missing")).toBeUndefined()
  })
})

describe("buildTagTree", () => {
  it("builds roots sorted by name with direct + roll-up counts", () => {
    const tree = buildTagTree(graph)
    expect(tree.map((n) => n.tag.name)).toEqual(["Alpha", "Epsilon"])
    const alpha = tree.find((n) => n.tag.name === "Alpha")!
    expect(alpha.directCount).toBe(1)
    expect(alpha.rollupCount).toBe(4)
    // Children of Alpha: Beta and Gamma (sorted).
    expect(alpha.children.map((c) => c.tag.name)).toEqual(["Beta", "Gamma"])
    const beta = alpha.children.find((c) => c.tag.name === "Beta")!
    expect(beta.directCount).toBe(1)
    expect(beta.rollupCount).toBe(2)
    expect(beta.children.map((c) => c.tag.name)).toEqual(["Delta"])
  })
})
