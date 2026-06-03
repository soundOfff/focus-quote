import type { ComponentChildren } from "preact"
import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import {
  ExternalLink,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-preact"
import type { Quote, TagGraph } from "@focus-quote/shared"
import {
  buildGraphModel,
  createSimulation,
  nodesBounds,
  type GraphModel,
  type SimNode,
  type Simulation,
} from "../../shared/force-graph"
import { quoteIdsForTag, tagsForQuote } from "../../shared/tag-graph"
import { Button, EmptyState } from "../../ui/primitives"

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))

/** Per-branch palette, drawn from the editorial status tints (theme tokens). */
const CLUSTERS: ReadonlyArray<{ fill: string; ring: string }> = [
  { fill: "var(--amber-soft)", ring: "var(--amber-deep)" },
  { fill: "var(--blue-soft)", ring: "var(--blue-ink)" },
  { fill: "var(--sage-soft)", ring: "var(--sage-ink)" },
  { fill: "var(--clay-soft)", ring: "var(--clay-ink)" },
]
const clusterOf = (i: number) => CLUSTERS[i % CLUSTERS.length]!

const truncate = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

interface View {
  x: number
  y: number
  k: number
}

const MIN_K = 0.2
const MAX_K = 4

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

export interface KnowledgeGraphProps {
  quotes: ReadonlyArray<Quote>
  graph: TagGraph
  /** Jump back to the list view focused on a tag (parent owns the tab state). */
  onShowInList: (tagId: string) => void
  /** Delete a tag (parent owns the confirm + reload, shared with the list). */
  onDeleteTag: (tagId: string, name: string) => void
}

/**
 * Force-directed "knowledge graph" view of the Tag DAG — an organic, Obsidian-
 * style lens on the same data the list view shows as a tree. Tags are nodes
 * (sized by rolled-up quote count, colored by top-level branch); hierarchy
 * edges and (optionally) quote leaves are the links. Pan, zoom, drag, hover to
 * highlight a neighborhood, click to inspect. Layout + physics live in the pure
 * `force-graph` module; this component owns the render loop and interaction.
 */
export function KnowledgeGraph({
  quotes,
  graph,
  onShowInList,
  onDeleteTag,
}: KnowledgeGraphProps) {
  const [includeQuotes, setIncludeQuotes] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  // Bumped each animation tick so Preact re-reads the mutated node positions.
  const [, setFrame] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const modelRef = useRef<GraphModel | null>(null)
  const simRef = useRef<Simulation | null>(null)
  const rafRef = useRef<number | null>(null)
  const viewRef = useRef<View>(view)
  const sizeRef = useRef({ w: 0, h: 0 })
  const dragRef = useRef<{ node: SimNode; moved: boolean } | null>(null)
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(
    null,
  )

  const setViewBoth = (next: View) => {
    viewRef.current = next
    setView(next)
  }

  const model = useMemo(
    () => buildGraphModel(graph, quotes, { includeQuotes }),
    [graph, quotes, includeQuotes],
  )

  const stopLoop = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const ensureLoop = () => {
    if (rafRef.current != null) return
    const step = () => {
      const sim = simRef.current
      if (!sim) {
        rafRef.current = null
        return
      }
      // Two ticks per frame: settles in ~2s while staying smooth.
      sim.tick()
      sim.tick()
      setFrame((f) => (f + 1) % 1_000_000)
      if (sim.settled() && !dragRef.current) {
        rafRef.current = null
      } else {
        rafRef.current = requestAnimationFrame(step)
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  const fitToView = () => {
    const m = modelRef.current
    const { w, h } = sizeRef.current
    if (!m || m.nodes.length === 0 || w === 0 || h === 0) return
    const b = nodesBounds(m.nodes)
    const bw = b.maxX - b.minX || 1
    const bh = b.maxY - b.minY || 1
    const pad = 64
    const k = clamp(
      Math.min((w - pad * 2) / bw, (h - pad * 2) / bh),
      MIN_K,
      2.2,
    )
    const midX = (b.minX + b.maxX) / 2
    const midY = (b.minY + b.maxY) / 2
    setViewBoth({ x: -midX * k, y: -midY * k, k })
  }

  // Track container size.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      const first = sizeRef.current.w === 0
      sizeRef.current = { w: r.width, h: r.height }
      if (first) fitToView()
    })
    ro.observe(el)
    sizeRef.current = { w: el.clientWidth, h: el.clientHeight }
    return () => ro.disconnect()
  }, [])

  // Build the simulation whenever the model changes (graph / quotes / toggle).
  useEffect(() => {
    modelRef.current = model
    const sim = createSimulation(model)
    simRef.current = sim
    // Warm start so the first paint and the auto-fit aren't a tangle.
    sim.settle(70)
    setSelectedId((id) => (model.nodes.some((n) => n.id === id) ? id : null))
    if (prefersReducedMotion()) {
      sim.settle()
      setFrame((f) => f + 1)
      fitToView()
    } else {
      fitToView()
      ensureLoop()
    }
    return stopLoop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  // Non-passive wheel listener so we can preventDefault the page scroll.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const v = viewRef.current
      const factor = Math.exp(-e.deltaY * 0.0015)
      const k = clamp(v.k * factor, MIN_K, MAX_K)
      if (k === v.k) return
      // Keep the graph point under the cursor fixed.
      const gx = (mx - rect.width / 2 - v.x) / v.k
      const gy = (my - rect.height / 2 - v.y) / v.k
      setViewBoth({ x: mx - rect.width / 2 - gx * k, y: my - rect.height / 2 - gy * k, k })
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [])

  const toGraph = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return {
      x: (clientX - rect.left - rect.width / 2 - v.x) / v.k,
      y: (clientY - rect.top - rect.height / 2 - v.y) / v.k,
    }
  }

  // --- pointer interaction ---
  const onNodePointerDown = (e: PointerEvent, node: SimNode) => {
    e.stopPropagation()
    // Capture on the SVG (not the node) so the svg-level pointermove/up handlers
    // keep firing while dragging — capturing on the node would redirect events
    // away from them and freeze the drag.
    svgRef.current?.setPointerCapture?.(e.pointerId)
    dragRef.current = { node, moved: false }
    node.fx = node.x
    node.fy = node.y
    simRef.current?.reheat(0.5)
    ensureLoop()
  }

  const onSvgPointerDown = (e: PointerEvent) => {
    const v = viewRef.current
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y }
    svgRef.current?.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current
    if (drag) {
      const p = toGraph(e.clientX, e.clientY)
      drag.node.fx = p.x
      drag.node.fy = p.y
      drag.moved = true
      simRef.current?.reheat(0.4)
      ensureLoop()
      return
    }
    const pan = panRef.current
    if (pan) {
      setViewBoth({
        ...viewRef.current,
        x: pan.ox + (e.clientX - pan.sx),
        y: pan.oy + (e.clientY - pan.sy),
      })
    }
  }

  const endInteraction = (e: PointerEvent) => {
    const drag = dragRef.current
    if (drag) {
      drag.node.fx = null
      drag.node.fy = null
      if (!drag.moved) {
        setSelectedId(drag.node.id)
      }
      dragRef.current = null
      simRef.current?.reheat(0.2)
      ensureLoop()
      return
    }
    const pan = panRef.current
    if (pan) {
      const moved =
        Math.abs(e.clientX - pan.sx) > 3 || Math.abs(e.clientY - pan.sy) > 3
      panRef.current = null
      if (!moved) setSelectedId(null)
    }
  }

  const zoomBy = (factor: number) => {
    const v = viewRef.current
    const k = clamp(v.k * factor, MIN_K, MAX_K)
    // Zoom around the viewport center (translate unchanged keeps center fixed).
    setViewBoth({ x: (v.x / v.k) * k, y: (v.y / v.k) * k, k })
  }

  const rerun = () => {
    const sim = simRef.current
    if (!sim) return
    sim.reheat(1)
    ensureLoop()
  }

  const focusFirstMatch = () => {
    const q = query.trim().toLowerCase()
    if (!q) return
    const m = modelRef.current
    if (!m) return
    const hit = m.nodes.find(
      (n) => n.kind === "tag" && n.label.toLowerCase().includes(q),
    )
    if (!hit) return
    setSelectedId(hit.id)
    const v = viewRef.current
    const k = Math.max(v.k, 1.2)
    setViewBoth({ x: -hit.x * k, y: -hit.y * k, k })
  }

  // --- highlight state (derived) ---
  const q = query.trim().toLowerCase()
  const activeId = hoveredId ?? selectedId
  const neighborSet =
    activeId != null ? model.neighbors.get(activeId) : undefined

  const nodeDimmed = (n: SimNode): boolean => {
    if (q) return !(n.kind === "tag" && n.label.toLowerCase().includes(q))
    if (activeId == null) return false
    return n.id !== activeId && !(neighborSet?.has(n.id) ?? false)
  }
  const linkActive = (sId: string, tId: string): boolean => {
    if (q) return false
    if (activeId == null) return false
    return sId === activeId || tId === activeId
  }

  const labelVisible = (n: SimNode): boolean => {
    if (n.kind === "quote") return n.id === activeId
    if (n.id === activeId || (neighborSet?.has(n.id) ?? false)) return true
    if (q && n.label.toLowerCase().includes(q)) return true
    return view.k >= 1.15 || n.r >= 13
  }

  // --- selection drawer data ---
  const selectedTag =
    selectedId != null
      ? graph.tags.find((t) => t.id === selectedId)
      : undefined
  const selectedTagQuotes = useMemo(() => {
    if (!selectedTag) return [] as Quote[]
    const ids = quoteIdsForTag(graph, selectedTag.id, true)
    return quotes.filter((qt) => ids.has(qt.id))
  }, [selectedTag, graph, quotes])
  const selectedQuoteNode =
    selectedId != null && selectedId.startsWith("q:")
      ? model.nodes.find((n) => n.id === selectedId)
      : undefined

  if (graph.tags.length === 0) {
    return (
      <EmptyState
        title="No tags to graph yet"
        description="Save a few quotes and let them get filed into Tags — your knowledge graph will grow here. You can also tag manually from the list view."
      />
    )
  }

  const w = sizeRef.current.w
  const h = sizeRef.current.h

  return (
    <div class="flex flex-col gap-2">
      {/* Controls row */}
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={includeQuotes}
            onClick={() => setIncludeQuotes((v) => !v)}
            class={cx(
              "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
              includeQuotes
                ? "border-ink bg-surface-soft text-ink"
                : "border-hairline text-mute hover:text-body",
            )}
          >
            <span
              class={cx(
                "h-2 w-2 rounded-full",
                includeQuotes ? "bg-primary" : "bg-hairline",
              )}
              aria-hidden
            />
            Show quotes
          </button>
          <div class="flex h-8 items-center gap-1.5 rounded-control border border-rule-2 bg-paper pl-2.5 pr-1 focus-within:border-amber-deep focus-within:ring-[3px] focus-within:ring-amber/18">
            <Search size={13} class="shrink-0 text-muted-2" aria-hidden />
            <input
              type="text"
              value={query}
              placeholder="Find a tag…"
              aria-label="Find a tag in the graph"
              onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") focusFirstMatch()
                if (e.key === "Escape") setQuery("")
              }}
              class="h-full w-36 bg-transparent text-xs text-ink placeholder:text-muted-2 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                class="grid h-5 w-5 place-items-center rounded text-muted hover:text-ink"
              >
                <X size={12} aria-hidden />
              </button>
            )}
          </div>
        </div>
        <span class="font-mono text-[10.5px] uppercase tracking-mono text-muted-2">
          {model.nodes.filter((n) => n.kind === "tag").length} tags
          {includeQuotes &&
            ` · ${model.nodes.filter((n) => n.kind === "quote").length} quotes`}
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        class="relative h-[70vh] min-h-[440px] w-full select-none overflow-hidden rounded-card border border-rule bg-paper-2"
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          role="application"
          aria-label="Knowledge graph of your tags. Drag to pan, scroll to zoom, click a node to inspect."
          class="block h-full w-full touch-none"
          style={{ cursor: panRef.current ? "grabbing" : "grab" }}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endInteraction}
          onPointerLeave={endInteraction}
        >
          {/* Backdrop catches background pointer events even where empty. */}
          <rect x="0" y="0" width="100%" height="100%" fill="transparent" />
          <g transform={`translate(${w / 2 + view.x}, ${h / 2 + view.y}) scale(${view.k})`}>
            {/* Links under nodes */}
            <g>
              {model.links.map((l) => {
                const active = linkActive(l.source, l.target)
                const dimmed =
                  (activeId != null || q.length > 0) && !active
                return (
                  <line
                    key={`${l.source}->${l.target}`}
                    x1={l.s.x}
                    y1={l.s.y}
                    x2={l.t.x}
                    y2={l.t.y}
                    stroke={
                      active
                        ? "var(--ink-2)"
                        : l.kind === "hierarchy"
                          ? "var(--muted-2)"
                          : "var(--rule-2)"
                    }
                    stroke-width={active ? 1.8 : l.kind === "hierarchy" ? 1.3 : 1}
                    stroke-dasharray={l.kind === "membership" ? "2 3" : undefined}
                    stroke-linecap="round"
                    opacity={dimmed ? 0.12 : l.kind === "hierarchy" ? 0.6 : 0.4}
                  />
                )
              })}
            </g>
            {/* Nodes */}
            <g>
              {model.nodes.map((n) => {
                const dim = nodeDimmed(n)
                const selected = n.id === selectedId
                const palette = clusterOf(n.cluster)
                const isTag = n.kind === "tag"
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    opacity={dim ? 0.2 : 1}
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => onNodePointerDown(e as PointerEvent, n)}
                    onPointerEnter={() => setHoveredId(n.id)}
                    onPointerLeave={() => setHoveredId(null)}
                  >
                    {selected && (
                      <circle
                        r={n.r + 5}
                        fill="none"
                        stroke="var(--amber-deep)"
                        stroke-width={1.5}
                        opacity={0.9}
                      />
                    )}
                    {isTag ? (
                      <circle
                        r={n.r}
                        fill={palette.fill}
                        stroke={n.userEdited ? "var(--amber-deep)" : palette.ring}
                        stroke-width={selected ? 2.4 : 1.5}
                      />
                    ) : (
                      <circle
                        r={n.r}
                        fill="var(--muted-2)"
                        stroke="var(--paper-2)"
                        stroke-width={1}
                      />
                    )}
                    {n.userEdited && isTag && (
                      <circle
                        cx={n.r * 0.66}
                        cy={-n.r * 0.66}
                        r={2.4}
                        fill="var(--amber)"
                        stroke="var(--paper-2)"
                        stroke-width={0.8}
                      />
                    )}
                    {labelVisible(n) && (
                      <text
                        x={0}
                        y={n.r + 11}
                        text-anchor="middle"
                        font-size={isTag ? 11 : 10}
                        font-weight={isTag ? 600 : 500}
                        fill={isTag ? "var(--ink)" : "var(--muted)"}
                        stroke="var(--paper-2)"
                        stroke-width={3}
                        stroke-linejoin="round"
                        paint-order="stroke"
                        class="pointer-events-none font-sans"
                      >
                        {truncate(n.label, isTag ? 24 : 30)}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </g>
        </svg>

        {/* Zoom / fit controls */}
        <div class="absolute bottom-3 right-3 flex flex-col gap-1">
          <GraphIconButton label="Zoom in" onClick={() => zoomBy(1.25)}>
            <Plus size={15} aria-hidden />
          </GraphIconButton>
          <GraphIconButton label="Zoom out" onClick={() => zoomBy(0.8)}>
            <Minus size={15} aria-hidden />
          </GraphIconButton>
          <GraphIconButton label="Fit to view" onClick={fitToView}>
            <Maximize2 size={14} aria-hidden />
          </GraphIconButton>
          <GraphIconButton label="Re-run layout" onClick={rerun}>
            <RotateCcw size={14} aria-hidden />
          </GraphIconButton>
        </div>

        {/* Quote-cap notice */}
        {model.quotesOmitted > 0 && (
          <div class="absolute bottom-3 left-3 rounded-control border border-rule-2 bg-paper/90 px-2.5 py-1 text-[11px] text-muted backdrop-blur-sm">
            Showing first {model.nodes.filter((n) => n.kind === "quote").length} quotes
            · {model.quotesOmitted} more hidden
          </div>
        )}

        {/* Selection drawer */}
        {(selectedTag || selectedQuoteNode) && (
          <aside class="absolute right-3 top-3 flex max-h-[calc(100%-1.5rem)] w-72 flex-col overflow-hidden rounded-card border border-rule bg-paper shadow-popup">
            <header class="flex items-start justify-between gap-2 border-b border-rule px-3.5 py-3">
              <div class="min-w-0">
                {selectedTag ? (
                  <>
                    <h3 class="flex items-center gap-1.5 break-words font-serif text-[15px] font-semibold leading-tight text-ink">
                      {selectedTag.name}
                      {selectedTag.userEdited && (
                        <span
                          class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          title="Pinned (your edit)"
                          aria-hidden
                        />
                      )}
                    </h3>
                    <p class="mt-0.5 font-mono text-[10px] uppercase tracking-mono text-muted">
                      {selectedTagQuotes.length} quote
                      {selectedTagQuotes.length === 1 ? "" : "s"} · incl. sub-tags
                    </p>
                  </>
                ) : (
                  <p class="font-mono text-[10px] uppercase tracking-mono text-muted">
                    Quote
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                class="grid h-6 w-6 shrink-0 place-items-center rounded text-muted hover:text-ink"
              >
                <X size={14} aria-hidden />
              </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
              {selectedTag ? (
                selectedTagQuotes.length === 0 ? (
                  <p class="text-xs text-muted">
                    No quotes filed here yet.
                  </p>
                ) : (
                  <ul class="flex flex-col gap-2.5">
                    {selectedTagQuotes.slice(0, 12).map((qt) => (
                      <li key={qt.id} class="border-l-2 border-rule-2 pl-2.5">
                        <blockquote class="font-serif text-[12.5px] leading-snug text-ink-2">
                          {truncate(qt.text, 160)}
                        </blockquote>
                        {(qt.sourceTitle || qt.sourceUrl) &&
                          (qt.sourceUrl ? (
                            <a
                              href={qt.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-link-blue hover:underline"
                            >
                              {truncate(qt.sourceTitle ?? qt.sourceUrl, 32)}
                              <ExternalLink size={9} aria-hidden />
                            </a>
                          ) : (
                            <span class="mt-1 block text-[11px] text-muted">
                              {truncate(qt.sourceTitle ?? "", 32)}
                            </span>
                          ))}
                      </li>
                    ))}
                    {selectedTagQuotes.length > 12 && (
                      <li class="text-[11px] text-muted">
                        +{selectedTagQuotes.length - 12} more
                      </li>
                    )}
                  </ul>
                )
              ) : selectedQuoteNode?.quote ? (
                <div class="flex flex-col gap-2.5">
                  <blockquote class="font-serif text-[13px] leading-snug text-ink">
                    {selectedQuoteNode.quote.text}
                  </blockquote>
                  {selectedQuoteNode.quote.sourceUrl && (
                    <a
                      href={selectedQuoteNode.quote.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-0.5 text-[11px] font-medium text-link-blue hover:underline"
                    >
                      {truncate(
                        selectedQuoteNode.quote.sourceTitle ??
                          selectedQuoteNode.quote.sourceUrl,
                        36,
                      )}
                      <ExternalLink size={9} aria-hidden />
                    </a>
                  )}
                  <div class="flex flex-wrap gap-1.5">
                    {tagsForQuote(graph, selectedQuoteNode.quote.id).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        class="rounded-pill border border-hairline px-2 py-0.5 text-[11px] font-medium text-body hover:border-amber hover:text-amber-deep"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {selectedTag && (
              <footer class="flex items-center gap-1.5 border-t border-rule px-3.5 py-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  class="!rounded-md flex-1 gap-1.5"
                  onClick={() => onShowInList(selectedTag.id)}
                >
                  Show in list →
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTag(selectedTag.id, selectedTag.name)
                    setSelectedId(null)
                  }}
                  aria-label={`Delete tag ${selectedTag.name}`}
                  class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-rule-2 bg-paper text-muted transition-colors hover:border-clay-ink/40 hover:text-accent-red"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </footer>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

function GraphIconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: preact.ComponentChildren
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      class="grid h-8 w-8 place-items-center rounded-control border border-rule-2 bg-paper/90 text-ink-2 backdrop-blur-sm transition-colors hover:border-muted-2 hover:bg-paper hover:text-ink focus:outline-none focus-visible:border-amber-deep focus-visible:ring-[3px] focus-visible:ring-amber/20"
    >
      {children}
    </button>
  )
}
