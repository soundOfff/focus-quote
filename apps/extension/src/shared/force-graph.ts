import type { Quote, TagGraph } from "@focus-quote/shared"
import { quoteIdsForTag, rootTagIds } from "./tag-graph"

/**
 * A dependency-free force-directed graph engine for the knowledge-graph view of
 * the Tag DAG (ADR 0003). Two reasons it's homegrown rather than a library:
 *
 *  1. MV3 strict CSP forbids `eval` / `new Function`; a hand-written simulation
 *     is safe by construction and adds zero bundle weight (the lightweight
 *     philosophy in CLAUDE.md).
 *  2. The whole view is themed with the editorial CSS-variable palette, so we
 *     render our own SVG anyway — only the *layout* needs an engine, and at this
 *     scale (tags: tens–low-hundreds; optional quote leaves capped) a cooled
 *     O(n²) Verlet integrator is both correct and smooth.
 *
 * This module is pure (no Preact, no DOM) so the physics and the TagGraph →
 * nodes/links mapping are unit-testable. The Preact `<KnowledgeGraph>` owns the
 * render loop, the viewport transform, and pointer interaction.
 */

export type GraphNodeKind = "tag" | "quote"

export interface SimNode {
  id: string
  kind: GraphNodeKind
  label: string
  /** Tag: distinct quotes rolled up through sub-tags. Quote leaf: always 1. */
  weight: number
  /** Render radius, derived from `weight`. */
  r: number
  /** Index of the root subtree this node hangs under — drives branch color. */
  cluster: number
  /** Manual-pin marker (mirrors the tree's "your edit" dot). */
  userEdited: boolean
  /** Repulsion charge (negative = repel); scaled by radius so hubs spread. */
  charge: number
  /** Spring degree (number of incident links) — biases link tension. */
  degree: number
  // --- mutable physics state (updated in place each tick) ---
  x: number
  y: number
  vx: number
  vy: number
  /** Pinned coordinates while dragging (null = free to move). */
  fx: number | null
  fy: number | null
  /** Back-reference for the selection drawer (quote nodes only). */
  quote?: Quote
}

export interface SimLink {
  source: string
  target: string
  kind: "hierarchy" | "membership"
  /** Resolved at build time so the tick loop never re-looks-up nodes. */
  s: SimNode
  t: SimNode
  /** Rest length of the spring. */
  length: number
  /** Per-link spring strength (1/min-degree, d3-style, so hubs stay put). */
  strength: number
  /** Share of correction applied to the target (source gets 1 - bias). */
  bias: number
}

export interface GraphModel {
  nodes: SimNode[]
  links: SimLink[]
  /** node id → ids of directly linked nodes (for hover-neighbor highlight). */
  neighbors: Map<string, Set<string>>
  /** Quote nodes dropped to stay under the cap (0 unless quotes were capped). */
  quotesOmitted: number
}

export interface BuildOptions {
  /** Add quote leaf nodes hanging off their tags. */
  includeQuotes: boolean
  /** Hard cap on quote leaf nodes to keep the O(n²) sim smooth. */
  quoteCap?: number
}

const TAG_BASE_R = 7
const TAG_R_SCALE = 3.4
const TAG_MAX_R = 30
const QUOTE_R = 3.5

/** Radius grows with √weight so area ≈ count without dwarfing small tags. */
export const tagRadius = (weight: number): number =>
  Math.min(TAG_MAX_R, TAG_BASE_R + TAG_R_SCALE * Math.sqrt(Math.max(0, weight)))

/**
 * Assign every tag to the root subtree that reaches it first, so each top-level
 * branch can be painted a distinct color. Multi-parent tags (legal in the DAG)
 * inherit the first reaching root. Stable: roots are visited in array order.
 */
const clusterByRoot = (graph: TagGraph): Map<string, number> => {
  const children = new Map<string, string[]>()
  for (const e of graph.edges) {
    const arr = children.get(e.parentId)
    if (arr) arr.push(e.childId)
    else children.set(e.parentId, [e.childId])
  }
  const cluster = new Map<string, number>()
  const roots = rootTagIds(graph)
  roots.forEach((rootId, i) => {
    const stack = [rootId]
    while (stack.length > 0) {
      const id = stack.pop()!
      if (cluster.has(id)) continue
      cluster.set(id, i)
      for (const c of children.get(id) ?? []) stack.push(c)
    }
  })
  // Any tag not reached from a root (shouldn't happen in a DAG, but be safe)
  // gets its own bucket so it still renders with a color.
  let next = roots.length
  for (const t of graph.tags) if (!cluster.has(t.id)) cluster.set(t.id, next++)
  return cluster
}

/**
 * Deterministic phyllotaxis (sunflower) seed positions. Avoids `Math.random`
 * so a reload lays the graph out identically, and spreads nodes so the sim
 * starts untangled rather than from a single overlapping point.
 */
const seedPosition = (i: number): { x: number; y: number } => {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const radius = 12 * Math.sqrt(i + 0.5)
  const theta = i * golden
  return { x: radius * Math.cos(theta), y: radius * Math.sin(theta) }
}

/** Map the synced TagGraph read-model into renderable nodes + links. */
export const buildGraphModel = (
  graph: TagGraph,
  quotes: ReadonlyArray<Quote>,
  opts: BuildOptions,
): GraphModel => {
  const cluster = clusterByRoot(graph)
  const tagById = new Map(graph.tags.map((t) => [t.id, t]))
  const nodeById = new Map<string, SimNode>()
  const nodes: SimNode[] = []
  const degree = new Map<string, number>()

  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1)

  graph.tags.forEach((tag, i) => {
    const weight = quoteIdsForTag(graph, tag.id, true).size
    const r = tagRadius(weight)
    const seed = seedPosition(i)
    const node: SimNode = {
      id: tag.id,
      kind: "tag",
      label: tag.name,
      weight,
      r,
      cluster: cluster.get(tag.id) ?? 0,
      userEdited: tag.userEdited,
      charge: -(34 + r * 4.5),
      degree: 0,
      x: seed.x,
      y: seed.y,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    }
    nodes.push(node)
    nodeById.set(node.id, node)
  })

  // Optional quote leaves. Seeded near their (first) tag so they don't fling in
  // from across the canvas. Capped to protect the O(n²) inner loop.
  const cap = opts.quoteCap ?? 600
  let quotesOmitted = 0
  if (opts.includeQuotes) {
    const membersByQuote = new Map<string, string[]>()
    for (const m of graph.memberships) {
      if (!tagById.has(m.tagId)) continue
      const arr = membersByQuote.get(m.quoteId)
      if (arr) arr.push(m.tagId)
      else membersByQuote.set(m.quoteId, [m.tagId])
    }
    let added = 0
    for (const q of quotes) {
      const tagIds = membersByQuote.get(q.id)
      if (!tagIds || tagIds.length === 0) continue
      if (added >= cap) {
        quotesOmitted++
        continue
      }
      const anchor = nodeById.get(tagIds[0]!)
      const node: SimNode = {
        id: `q:${q.id}`,
        kind: "quote",
        label: q.text,
        weight: 1,
        r: QUOTE_R,
        cluster: anchor?.cluster ?? 0,
        userEdited: false,
        charge: -18,
        degree: 0,
        x: (anchor?.x ?? 0) + seedPosition(added).x * 0.25,
        y: (anchor?.y ?? 0) + seedPosition(added).y * 0.25,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        quote: q,
      }
      nodes.push(node)
      nodeById.set(node.id, node)
      added++
    }
  }

  // --- links ---
  const rawLinks: Array<{ source: string; target: string; kind: SimLink["kind"] }> = []
  for (const e of graph.edges) {
    if (nodeById.has(e.parentId) && nodeById.has(e.childId)) {
      rawLinks.push({ source: e.parentId, target: e.childId, kind: "hierarchy" })
      bump(e.parentId)
      bump(e.childId)
    }
  }
  if (opts.includeQuotes) {
    for (const m of graph.memberships) {
      const qNodeId = `q:${m.quoteId}`
      if (nodeById.has(qNodeId) && nodeById.has(m.tagId)) {
        rawLinks.push({ source: m.tagId, target: qNodeId, kind: "membership" })
        bump(m.tagId)
        bump(qNodeId)
      }
    }
  }
  for (const n of nodes) n.degree = degree.get(n.id) ?? 0

  const neighbors = new Map<string, Set<string>>()
  const addNeighbor = (a: string, b: string) => {
    const set = neighbors.get(a)
    if (set) set.add(b)
    else neighbors.set(a, new Set([b]))
  }

  const links: SimLink[] = rawLinks.map((l) => {
    const s = nodeById.get(l.source)!
    const t = nodeById.get(l.target)!
    addNeighbor(s.id, t.id)
    addNeighbor(t.id, s.id)
    const rest =
      l.kind === "hierarchy"
        ? 64 + s.r + t.r
        : 26 + s.r + t.r
    const minDeg = Math.max(1, Math.min(s.degree || 1, t.degree || 1))
    return {
      source: l.source,
      target: l.target,
      kind: l.kind,
      s,
      t,
      length: rest,
      strength: (l.kind === "hierarchy" ? 0.9 : 0.5) / minDeg,
      bias: (s.degree || 1) / ((s.degree || 1) + (t.degree || 1)),
    }
  })

  return { nodes, links, neighbors, quotesOmitted }
}

// ---- simulation ----

export interface SimConfig {
  /** Positional gravity toward origin — keeps the graph centered & isolates in. */
  gravity: number
  velocityDecay: number
  alphaDecay: number
  alphaMin: number
  /** Light overlap resolution so big tags don't sit on top of each other. */
  collidePadding: number
}

const DEFAULTS: SimConfig = {
  gravity: 0.045,
  velocityDecay: 0.6,
  alphaDecay: 0.0228,
  alphaMin: 0.0018,
  collidePadding: 3,
}

export interface Simulation {
  nodes: SimNode[]
  links: SimLink[]
  /** Current temperature (1 → hot, ≤ alphaMin → settled). */
  alpha: number
  /** Advance one step; returns the new alpha. */
  tick: () => number
  /** True once cooled below alphaMin. */
  settled: () => boolean
  /** Re-energize after an interaction (drag, data change, re-run). */
  reheat: (to?: number) => void
  /** Run synchronously to rest (for prefers-reduced-motion). */
  settle: (maxTicks?: number) => void
}

export const createSimulation = (
  model: Pick<GraphModel, "nodes" | "links">,
  config: Partial<SimConfig> = {},
): Simulation => {
  const cfg = { ...DEFAULTS, ...config }
  const { nodes, links } = model
  let alpha = 1

  const applyForces = (a: number) => {
    // Gravity toward the origin.
    for (const n of nodes) {
      n.vx += (0 - n.x) * cfg.gravity * a
      n.vy += (0 - n.y) * cfg.gravity * a
    }
    // Repulsion + light collision, single O(n²) pass.
    for (let i = 0; i < nodes.length; i++) {
      const a1 = nodes[i]!
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]!
        let dx = b.x - a1.x
        let dy = b.y - a1.y
        let l2 = dx * dx + dy * dy
        if (l2 === 0) {
          // Deterministic nudge so coincident nodes separate without RNG.
          dx = (((i * 31 + j) % 7) - 3) * 0.5
          dy = (((i * 17 + j) % 5) - 2) * 0.5
          l2 = dx * dx + dy * dy || 1
        }
        // Coulomb-style repulsion, weighted by both charges, scaled by alpha.
        const rep = (a1.charge * b.charge * a) / l2
        const inv = 1 / Math.sqrt(l2)
        const ux = dx * inv
        const uy = dy * inv
        // charges are negative, so rep > 0 → push apart along (a→b).
        a1.vx -= ux * rep * inv
        a1.vy -= uy * rep * inv
        b.vx += ux * rep * inv
        b.vy += uy * rep * inv

        // Overlap resolution (positional, independent of alpha so it never
        // lets nodes interpenetrate at rest).
        const dist = Math.sqrt(l2)
        const minDist = a1.r + b.r + cfg.collidePadding
        if (dist < minDist) {
          const push = ((minDist - dist) / dist) * 0.5
          const sx = dx * push
          const sy = dy * push
          if (a1.fx == null) {
            a1.x -= sx
            a1.y -= sy
          }
          if (b.fx == null) {
            b.x += sx
            b.y += sy
          }
        }
      }
    }
    // Spring links.
    for (const link of links) {
      const s = link.s
      const t = link.t
      let dx = t.x - s.x
      let dy = t.y - s.y
      let l = Math.sqrt(dx * dx + dy * dy)
      if (l === 0) {
        dx = 0.5
        dy = 0.5
        l = Math.SQRT1_2
      }
      const diff = ((l - link.length) / l) * link.strength * a
      const fx = dx * diff
      const fy = dy * diff
      t.vx -= fx * link.bias
      t.vy -= fy * link.bias
      s.vx += fx * (1 - link.bias)
      s.vy += fy * (1 - link.bias)
    }
  }

  const integrate = () => {
    for (const n of nodes) {
      if (n.fx != null) {
        n.x = n.fx
        n.vx = 0
      } else {
        n.x += n.vx *= cfg.velocityDecay
      }
      if (n.fy != null) {
        n.y = n.fy
        n.vy = 0
      } else {
        n.y += n.vy *= cfg.velocityDecay
      }
    }
  }

  const tick = (): number => {
    alpha += (0 - alpha) * cfg.alphaDecay
    applyForces(alpha)
    integrate()
    return alpha
  }

  return {
    nodes,
    links,
    get alpha() {
      return alpha
    },
    tick,
    settled: () => alpha <= cfg.alphaMin,
    reheat: (to = 0.7) => {
      alpha = Math.max(alpha, to)
    },
    settle: (maxTicks = 400) => {
      for (let i = 0; i < maxTicks && alpha > cfg.alphaMin; i++) tick()
    },
  }
}

/** Axis-aligned bounding box of node centers padded by radius — used by "Fit". */
export const nodesBounds = (
  nodes: ReadonlyArray<SimNode>,
): { minX: number; minY: number; maxX: number; maxY: number } => {
  if (nodes.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.r)
    minY = Math.min(minY, n.y - n.r)
    maxX = Math.max(maxX, n.x + n.r)
    maxY = Math.max(maxY, n.y + n.r)
  }
  return { minX, minY, maxX, maxY }
}
