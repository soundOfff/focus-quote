import { describe, it, expect } from "vitest"
import type { Quote, QuoteId, TagGraph, TagId } from "@focus-quote/shared"
import {
  buildGraphModel,
  createSimulation,
  nodesBounds,
  tagRadius,
} from "@/shared/force-graph"

const tag = (id: string, name: string, userEdited = false) => ({
  id: id as TagId,
  name,
  userEdited,
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
const quote = (id: string, text: string): Quote => ({
  id: id as QuoteId,
  text,
  sourceUrl: null,
  sourceTitle: null,
  contentHash: "0".repeat(64),
  categorizationStatus: "categorized",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})

// A(root) -> B, A -> C, B -> D ; E is a standalone root.
// memberships: q1@A, q2@B, q3@D, q4@C ; q5 untagged.
const graph: TagGraph = {
  tags: [
    tag("A", "Alpha"),
    tag("B", "Beta", true),
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
const quotes = [
  quote("q1", "one"),
  quote("q2", "two"),
  quote("q3", "three"),
  quote("q4", "four"),
  quote("q5", "five untagged"),
]

describe("tagRadius", () => {
  it("grows with weight but stays bounded", () => {
    expect(tagRadius(0)).toBeLessThan(tagRadius(5))
    expect(tagRadius(5)).toBeLessThan(tagRadius(50))
    expect(tagRadius(100000)).toBeLessThanOrEqual(30)
  })
})

describe("buildGraphModel (tags only)", () => {
  const model = buildGraphModel(graph, quotes, { includeQuotes: false })

  it("creates one node per tag and one link per resolvable edge", () => {
    expect(model.nodes).toHaveLength(5)
    expect(model.nodes.every((n) => n.kind === "tag")).toBe(true)
    expect(model.links).toHaveLength(3)
    expect(model.links.every((l) => l.kind === "hierarchy")).toBe(true)
  })

  it("rolls quote counts up through sub-tags into weight", () => {
    const a = model.nodes.find((n) => n.id === "A")!
    // A rolls up q1(A) + q2(B) + q3(D) + q4(C) = 4 distinct.
    expect(a.weight).toBe(4)
    const b = model.nodes.find((n) => n.id === "B")!
    expect(b.weight).toBe(2) // q2(B) + q3(D)
    const e = model.nodes.find((n) => n.id === "E")!
    expect(e.weight).toBe(0)
  })

  it("colors the two root subtrees as distinct clusters", () => {
    const cl = (id: string) => model.nodes.find((n) => n.id === id)!.cluster
    expect(cl("A")).toBe(cl("B"))
    expect(cl("A")).toBe(cl("D"))
    expect(cl("A")).not.toBe(cl("E"))
  })

  it("carries the userEdited pin marker", () => {
    expect(model.nodes.find((n) => n.id === "B")!.userEdited).toBe(true)
    expect(model.nodes.find((n) => n.id === "A")!.userEdited).toBe(false)
  })

  it("builds a symmetric neighbor index", () => {
    expect(model.neighbors.get("A")?.has("B")).toBe(true)
    expect(model.neighbors.get("B")?.has("A")).toBe(true)
    expect(model.neighbors.get("E")).toBeUndefined()
  })
})

describe("buildGraphModel (with quotes)", () => {
  it("adds a leaf per categorized quote and a membership link", () => {
    const model = buildGraphModel(graph, quotes, { includeQuotes: true })
    const quoteNodes = model.nodes.filter((n) => n.kind === "quote")
    // q1..q4 are categorized; q5 is untagged → excluded.
    expect(quoteNodes).toHaveLength(4)
    expect(model.links.filter((l) => l.kind === "membership")).toHaveLength(4)
    expect(model.quotesOmitted).toBe(0)
    const q3 = model.nodes.find((n) => n.id === "q:q3")!
    expect(q3.quote?.text).toBe("three")
  })

  it("honors the quote cap and reports the overflow", () => {
    const model = buildGraphModel(graph, quotes, {
      includeQuotes: true,
      quoteCap: 2,
    })
    expect(model.nodes.filter((n) => n.kind === "quote")).toHaveLength(2)
    expect(model.quotesOmitted).toBe(2)
  })
})

describe("createSimulation", () => {
  it("cools to rest and never produces NaN positions", () => {
    const model = buildGraphModel(graph, quotes, { includeQuotes: true })
    const sim = createSimulation(model)
    sim.settle(500)
    expect(sim.settled()).toBe(true)
    for (const n of model.nodes) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
  })

  it("separates linked nodes to roughly the spring rest length", () => {
    const model = buildGraphModel(graph, quotes, { includeQuotes: false })
    const sim = createSimulation(model)
    sim.settle(600)
    const a = model.nodes.find((n) => n.id === "A")!
    const b = model.nodes.find((n) => n.id === "B")!
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    // Connected nodes shouldn't collapse together or fly apart.
    expect(d).toBeGreaterThan(20)
    expect(d).toBeLessThan(400)
  })

  it("pins a node at its fixed coordinates while dragging", () => {
    const model = buildGraphModel(graph, quotes, { includeQuotes: false })
    const sim = createSimulation(model)
    const a = model.nodes.find((n) => n.id === "A")!
    a.fx = 100
    a.fy = -50
    sim.reheat(1)
    sim.settle(300)
    expect(a.x).toBe(100)
    expect(a.y).toBe(-50)
  })

  it("reheat raises the temperature above the settled floor", () => {
    const model = buildGraphModel(graph, quotes, { includeQuotes: false })
    const sim = createSimulation(model)
    sim.settle(600)
    expect(sim.settled()).toBe(true)
    sim.reheat()
    expect(sim.settled()).toBe(false)
  })
})

describe("nodesBounds", () => {
  it("returns a sane box for an empty graph", () => {
    const b = nodesBounds([])
    expect(b.maxX).toBeGreaterThan(b.minX)
    expect(b.maxY).toBeGreaterThan(b.minY)
  })
})
