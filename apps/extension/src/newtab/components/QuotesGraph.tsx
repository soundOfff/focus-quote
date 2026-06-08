import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks"
import {
  ExternalLink,
  Maximize2,
  Minus,
  Moon,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from "lucide-preact"
import type { Quote, Tag, TagGraph } from "@focus-quote/shared"
import {
  buildGraphModel,
  createSimulation,
  nodesBounds,
  type GraphModel,
  type SimNode,
  type Simulation,
} from "../../shared/force-graph"
import { quoteIdsForTag, rootTagIds, tagsForQuote } from "../../shared/tag-graph"
import { EmptyState, Segmented } from "../../ui/primitives"

/**
 * Obsidian-style force-directed graph of the Tag DAG, rendered to a <canvas>
 * (the list view's sibling behind the List/Graph toggle). Same data the list
 * shows as a tree, drawn as an organic map: tag hubs sized by quote count and
 * colored by topic (top-level branch), quote dots orbiting their tags, with
 * hierarchy, membership and co-occurrence springs pulling related subjects into
 * clusters.
 *
 * Physics + the TagGraph → nodes/links mapping live in the pure `force-graph`
 * module; this component owns canvas sizing, the render loop, the viewport
 * transform, pointer interaction and the overlay chrome. Layout settles then
 * idles (the RAF loop stops at alpha ~0) and only redraws on interaction.
 */

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))

const truncate = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

const MIN_K = 0.2
const MAX_K = 4

interface View {
  x: number
  y: number
  k: number
}

type PaneTheme = "light" | "dark"
const THEME_KEY = "focusquote.quotes.graphTheme"

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Concrete colors pulled from the themed CSS custom properties so the canvas
 * (which can't read `var(--…)`) paints in the same palette as the rest of the
 * UI. Re-resolved whenever the pane's scoped light/dark theme flips. Topic
 * colors are the four editorial status tints — the existing per-branch palette,
 * not new tokens.
 */
interface Palette {
  halo: string
  edge: string
  edgeHier: string
  edgeStrong: string
  tagLabel: string
  quoteLabel: string
  quoteFill: string
  pin: string
  pinDot: string
  clusters: ReadonlyArray<{ fill: string; ring: string }>
}

const CLUSTER_VARS: ReadonlyArray<{ fill: string; ring: string }> = [
  { fill: "--amber-soft", ring: "--amber-deep" },
  { fill: "--blue-soft", ring: "--blue-ink" },
  { fill: "--sage-soft", ring: "--sage-ink" },
  { fill: "--clay-soft", ring: "--clay-ink" },
]

const resolvePalette = (el: HTMLElement): Palette => {
  const cs = getComputedStyle(el)
  const v = (name: string) => cs.getPropertyValue(name).trim() || "#888"
  return {
    halo: v("--paper-2"),
    edge: v("--rule-2"),
    edgeHier: v("--muted-2"),
    edgeStrong: v("--ink-2"),
    tagLabel: v("--ink"),
    quoteLabel: v("--muted"),
    quoteFill: v("--muted-2"),
    pin: v("--amber-deep"),
    pinDot: v("--amber"),
    clusters: CLUSTER_VARS.map((c) => ({ fill: v(c.fill), ring: v(c.ring) })),
  }
}

/** CSS-var string for a cluster fill — used by the DOM legend (theme-aware). */
const clusterVarFill = (i: number) =>
  `var(${CLUSTER_VARS[i % CLUSTER_VARS.length]!.fill})`
const clusterVarRing = (i: number) =>
  `var(${CLUSTER_VARS[i % CLUSTER_VARS.length]!.ring})`

export interface QuotesGraphProps {
  quotes: ReadonlyArray<Quote>
  graph: TagGraph
  /** Roll sub-tag quotes up into hub size (shared with the list's toggle). */
  includeSubTags: boolean
  /** Bumped by the toolbar's "Tidy now" to re-heat the layout. */
  reheatSignal: number
  /** Jump back to the list focused on a tag (parent owns the tab state). */
  onShowInList: (tagId: string) => void
  /** Delete a tag (parent owns the confirm + reload, shared with the list). */
  onDeleteTag: (tagId: string, name: string) => void
}

export function QuotesGraph({
  quotes,
  graph,
  includeSubTags,
  reheatSignal,
  onShowInList,
  onDeleteTag,
}: QuotesGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [paneTheme, setPaneTheme] = useState<PaneTheme>("light")

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modelRef = useRef<GraphModel | null>(null)
  const simRef = useRef<Simulation | null>(null)
  const paletteRef = useRef<Palette | null>(null)
  const rafRef = useRef<number | null>(null)
  const drawRafRef = useRef<number | null>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, k: 1 })
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const dragRef = useRef<{ node: SimNode; moved: boolean } | null>(null)
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(
    null,
  )
  // Latest values the render loop reads without forcing a React re-render.
  const selectedRef = useRef<string | null>(null)
  const hoveredRef = useRef<string | null>(null)
  const queryRef = useRef("")

  const model = useMemo(
    () =>
      buildGraphModel(graph, quotes, {
        includeQuotes: true,
        rollupWeight: includeSubTags,
        coOccurrence: true,
      }),
    [graph, quotes, includeSubTags],
  )

  const roots = useMemo(() => rootTagIds(graph), [graph])
  const tagById = useMemo(
    () => new Map<string, Tag>(graph.tags.map((t) => [t.id, t])),
    [graph],
  )

  // --- viewport helpers -----------------------------------------------------

  const applyView = (next: View) => {
    viewRef.current = next
    requestDraw()
  }

  const toGraph = (clientX: number, clientY: number) => {
    const cv = canvasRef.current
    if (!cv) return { x: 0, y: 0 }
    const rect = cv.getBoundingClientRect()
    const v = viewRef.current
    const { w, h } = sizeRef.current
    return {
      x: (clientX - rect.left - w / 2 - v.x) / v.k,
      y: (clientY - rect.top - h / 2 - v.y) / v.k,
    }
  }

  const fitToView = () => {
    const m = modelRef.current
    const { w, h } = sizeRef.current
    if (!m || m.nodes.length === 0 || w === 0 || h === 0) return
    const b = nodesBounds(m.nodes)
    const bw = b.maxX - b.minX || 1
    const bh = b.maxY - b.minY || 1
    const pad = 70
    const k = clamp(Math.min((w - pad * 2) / bw, (h - pad * 2) / bh), MIN_K, 2.2)
    const midX = (b.minX + b.maxX) / 2
    const midY = (b.minY + b.maxY) / 2
    applyView({ x: -midX * k, y: -midY * k, k })
  }

  const zoomBy = (factor: number) => {
    const v = viewRef.current
    const k = clamp(v.k * factor, MIN_K, MAX_K)
    // Zoom about the viewport center (translate scales with k to keep it fixed).
    applyView({ x: (v.x / v.k) * k, y: (v.y / v.k) * k, k })
  }

  // --- render loop ----------------------------------------------------------

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
      draw()
      if (sim.settled() && !dragRef.current) {
        rafRef.current = null
      } else {
        rafRef.current = requestAnimationFrame(step)
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  /** One-off repaint while the sim is idle (hover, selection, theme, pan…). */
  const requestDraw = () => {
    if (rafRef.current != null || drawRafRef.current != null) return
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null
      draw()
    })
  }

  const measure = () => {
    const el = containerRef.current
    const cv = canvasRef.current
    if (!el || !cv) return
    const w = el.clientWidth
    const h = el.clientHeight
    if (w === 0 || h === 0) return
    const dpr = window.devicePixelRatio || 1
    const prev = sizeRef.current
    const first = prev.w === 0
    sizeRef.current = { w, h, dpr }
    cv.width = Math.max(1, Math.round(w * dpr))
    cv.height = Math.max(1, Math.round(h * dpr))
    cv.style.width = `${w}px`
    cv.style.height = `${h}px`
    if (first) fitToView()
    requestDraw()
  }

  const draw = () => {
    const cv = canvasRef.current
    const m = modelRef.current
    if (!cv) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    if (!paletteRef.current && containerRef.current) {
      paletteRef.current = resolvePalette(containerRef.current)
    }
    const pal = paletteRef.current
    const { w, h, dpr } = sizeRef.current
    const v = viewRef.current

    // Clear in device pixels, then switch to graph-space (incl. dpr) for shapes.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    if (!m || !pal || m.nodes.length === 0) return
    ctx.setTransform(
      v.k * dpr,
      0,
      0,
      v.k * dpr,
      (w / 2 + v.x) * dpr,
      (h / 2 + v.y) * dpr,
    )

    const q = queryRef.current.trim().toLowerCase()
    const active = hoveredRef.current ?? selectedRef.current
    const neighbors = active ? m.neighbors.get(active) : undefined

    // Search spotlight = matching tags + their direct neighbors.
    let spotlight: Set<string> | null = null
    if (q) {
      spotlight = new Set<string>()
      for (const n of m.nodes) {
        if (n.kind === "tag" && n.label.toLowerCase().includes(q)) {
          spotlight.add(n.id)
          for (const nb of m.neighbors.get(n.id) ?? []) spotlight.add(nb)
        }
      }
    }
    const focused = q.length > 0 || active != null

    const nodeDimmed = (n: SimNode): boolean => {
      if (spotlight) return !spotlight.has(n.id)
      if (!active) return false
      return n.id !== active && !(neighbors?.has(n.id) ?? false)
    }

    // --- edges ---
    ctx.lineCap = "round"
    for (const l of m.links) {
      const within = spotlight
        ? spotlight.has(l.source) && spotlight.has(l.target)
        : active != null && (l.source === active || l.target === active)
      let stroke: string
      let width: number
      let alpha: number
      if (within) {
        stroke = pal.edgeStrong
        width = 1.8
        alpha = 0.9
      } else if (l.kind === "hierarchy") {
        stroke = pal.edgeHier
        width = 1.3
        alpha = focused ? 0.08 : 0.55
      } else if (l.kind === "membership") {
        stroke = pal.edge
        width = 1
        alpha = focused ? 0.06 : 0.38
      } else {
        // co-occurrence — faintest, just a hint of the cluster pull.
        stroke = pal.edge
        width = 0.8
        alpha = focused ? 0.05 : 0.18
      }
      ctx.globalAlpha = alpha
      ctx.strokeStyle = stroke
      ctx.lineWidth = width
      ctx.setLineDash(l.kind === "membership" ? [2, 3] : [])
      ctx.beginPath()
      ctx.moveTo(l.s.x, l.s.y)
      ctx.lineTo(l.t.x, l.t.y)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // --- nodes ---
    for (const n of m.nodes) {
      const dim = nodeDimmed(n)
      ctx.globalAlpha = dim ? 0.18 : 1
      const selected = n.id === selectedRef.current
      if (n.kind === "tag") {
        const palette = pal.clusters[n.cluster % pal.clusters.length]!
        if (selected) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = pal.pin
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = palette.fill
        ctx.fill()
        ctx.strokeStyle = n.userEdited ? pal.pin : palette.ring
        ctx.lineWidth = selected ? 2.4 : 1.5
        ctx.stroke()
        if (n.userEdited) {
          ctx.beginPath()
          ctx.arc(n.x + n.r * 0.66, n.y - n.r * 0.66, 2.4, 0, Math.PI * 2)
          ctx.fillStyle = pal.pinDot
          ctx.fill()
        }
      } else {
        if (selected) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2)
          ctx.strokeStyle = pal.pin
          ctx.lineWidth = 1.4
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = pal.quoteFill
        ctx.fill()
        ctx.strokeStyle = pal.halo
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    // --- labels (screen space, constant size, fade in by zoom + node size) ---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.lineJoin = "round"
    for (const n of m.nodes) {
      const labelAlpha = labelOpacity(n, v.k, active, neighbors, q)
      if (labelAlpha <= 0.01) continue
      if (nodeDimmed(n)) continue
      const isTag = n.kind === "tag"
      const sx = w / 2 + v.x + n.x * v.k
      const sy = h / 2 + v.y + n.y * v.k + n.r * v.k + 5
      ctx.globalAlpha = labelAlpha
      ctx.font = `${isTag ? 600 : 500} ${isTag ? 11 : 10}px "Geist Sans", ui-sans-serif, system-ui, sans-serif`
      const text = truncate(n.label, isTag ? 24 : 34)
      ctx.strokeStyle = pal.halo
      ctx.lineWidth = 3
      ctx.strokeText(text, sx, sy)
      ctx.fillStyle = isTag ? pal.tagLabel : pal.quoteLabel
      ctx.fillText(text, sx, sy)
    }
    ctx.globalAlpha = 1
  }

  // --- pointer interaction --------------------------------------------------

  const pickNode = (clientX: number, clientY: number): SimNode | null => {
    const m = modelRef.current
    if (!m) return null
    const p = toGraph(clientX, clientY)
    const slop = 4 / viewRef.current.k
    let best: SimNode | null = null
    let bestD = Infinity
    for (const n of m.nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y)
      if (d <= n.r + slop && d < bestD) {
        best = n
        bestD = d
      }
    }
    return best
  }

  const setSelected = (id: string | null) => {
    selectedRef.current = id
    setSelectedId(id)
    requestDraw()
  }

  const setCursor = (c: string) => {
    const cv = canvasRef.current
    if (cv && cv.style.cursor !== c) cv.style.cursor = c
  }

  const onPointerDown = (e: PointerEvent) => {
    const cv = canvasRef.current
    cv?.setPointerCapture?.(e.pointerId)
    const node = pickNode(e.clientX, e.clientY)
    if (node) {
      dragRef.current = { node, moved: false }
      node.fx = node.x
      node.fy = node.y
      simRef.current?.reheat(0.5)
      ensureLoop()
      return
    }
    const v = viewRef.current
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y, moved: false }
    setCursor("grabbing")
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
      if (Math.abs(e.clientX - pan.sx) > 3 || Math.abs(e.clientY - pan.sy) > 3)
        pan.moved = true
      applyView({ ...viewRef.current, x: pan.ox + (e.clientX - pan.sx), y: pan.oy + (e.clientY - pan.sy) })
      return
    }
    // Hover highlight.
    const node = pickNode(e.clientX, e.clientY)
    const id = node?.id ?? null
    setCursor(node ? "pointer" : "grab")
    if (id !== hoveredRef.current) {
      hoveredRef.current = id
      requestDraw()
    }
  }

  const endInteraction = (e: PointerEvent) => {
    const drag = dragRef.current
    if (drag) {
      drag.node.fx = null
      drag.node.fy = null
      if (!drag.moved) setSelected(drag.node.id)
      dragRef.current = null
      simRef.current?.reheat(0.2)
      ensureLoop()
      return
    }
    const pan = panRef.current
    if (pan) {
      panRef.current = null
      setCursor("grab")
      if (!pan.moved) setSelected(null)
    }
  }

  const onPointerLeave = (e: PointerEvent) => {
    if (hoveredRef.current != null && !dragRef.current && !panRef.current) {
      hoveredRef.current = null
      requestDraw()
    }
    endInteraction(e)
  }

  // Defensive teardown for a gesture the browser ends without a pointerup —
  // touch interruption, palm rejection, an OS/edge gesture, or capture loss.
  // Without it a dragged node keeps its fx/fy pin and the RAF loop never idles
  // (step() loops until !dragRef.current). Safe to run after a normal pointerup
  // too: the guards no-op once endInteraction has already cleared the refs.
  const cancelInteraction = () => {
    const drag = dragRef.current
    if (drag) {
      drag.node.fx = null
      drag.node.fy = null
      dragRef.current = null
      simRef.current?.reheat(0.2)
      ensureLoop()
    }
    if (panRef.current) panRef.current = null
    setCursor("grab")
  }

  const focusFirstMatch = () => {
    const m = modelRef.current
    const ql = query.trim().toLowerCase()
    if (!m || !ql) return
    const hit = m.nodes.find(
      (n) => n.kind === "tag" && n.label.toLowerCase().includes(ql),
    )
    if (!hit) return
    setSelected(hit.id)
    const v = viewRef.current
    const k = Math.max(v.k, 1.2)
    applyView({ x: -hit.x * k, y: -hit.y * k, k })
  }

  // --- effects --------------------------------------------------------------

  // Size the canvas to its real client box (× dpr) before first paint, and keep
  // it in sync. useLayoutEffect + a post-layout pass so it never sticks at the
  // default 300×150; ResizeObserver covers container resizes, window 'resize'
  // covers viewport changes. Dragging the window to a different-density monitor
  // changes devicePixelRatio WITHOUT firing resize, so we also watch a
  // `(resolution: Ndppx)` media query and re-arm it around the new dpr on each
  // change. measure() reads devicePixelRatio fresh every call.
  useLayoutEffect(() => {
    measure()
    const raf = requestAnimationFrame(measure)
    const el = containerRef.current
    const ro = new ResizeObserver(() => measure())
    if (el) ro.observe(el)
    window.addEventListener("resize", measure)

    let mql: MediaQueryList | null = null
    const onDprChange = () => {
      measure()
      armDpr() // the old query no longer flips; re-arm around the new dpr.
    }
    const armDpr = () => {
      if (mql) mql.removeEventListener("change", onDprChange)
      if (typeof window.matchMedia !== "function") return
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      mql.addEventListener("change", onDprChange)
    }
    armDpr()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("resize", measure)
      if (mql) mql.removeEventListener("change", onDprChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Non-passive wheel listener so we can preventDefault the page scroll.
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = cv.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const v = viewRef.current
      const { w, h } = sizeRef.current
      const factor = Math.exp(-e.deltaY * 0.0015)
      const k = clamp(v.k * factor, MIN_K, MAX_K)
      if (k === v.k) return
      const gx = (mx - w / 2 - v.x) / v.k
      const gy = (my - h / 2 - v.y) / v.k
      applyView({ x: mx - w / 2 - gx * k, y: my - h / 2 - gy * k, k })
    }
    cv.addEventListener("wheel", onWheel, { passive: false })
    return () => cv.removeEventListener("wheel", onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build the simulation whenever the model changes (graph / quotes / toggle).
  useEffect(() => {
    modelRef.current = model
    const sim = createSimulation(model)
    simRef.current = sim
    sim.settle(70) // warm start so the first paint isn't a tangle
    if (selectedRef.current && !model.nodes.some((n) => n.id === selectedRef.current)) {
      setSelected(null)
    }
    if (prefersReducedMotion()) {
      sim.settle()
      fitToView()
      requestDraw()
    } else {
      fitToView()
      ensureLoop()
    }
    return stopLoop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  // Re-resolve canvas colors when the scoped pane theme flips, and persist it.
  // The mount run re-resolves the palette but must NOT write: firing before the
  // restore effect's async get resolves, it would clobber a saved "dark" with
  // the default "light". Skip the first write; only user-driven flips persist.
  const firstPersist = useRef(true)
  useEffect(() => {
    if (containerRef.current) {
      paletteRef.current = resolvePalette(containerRef.current)
      requestDraw()
    }
    if (firstPersist.current) {
      firstPersist.current = false
      return
    }
    chrome.storage?.local?.set({ [THEME_KEY]: paneTheme }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneTheme])

  // Restore the persisted pane theme once.
  useEffect(() => {
    chrome.storage?.local
      ?.get(THEME_KEY)
      .then((r) => {
        const t = r?.[THEME_KEY]
        if (t === "light" || t === "dark") setPaneTheme(t)
      })
      .catch(() => {})
  }, [])

  // "Tidy now" (toolbar) re-heats the layout.
  const firstReheat = useRef(true)
  useEffect(() => {
    if (firstReheat.current) {
      firstReheat.current = false
      return
    }
    simRef.current?.reheat(1)
    ensureLoop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reheatSignal])

  // Cancel any pending idle repaint on unmount (the loop is cleaned by [model]).
  useEffect(
    () => () => {
      if (drawRafRef.current != null) cancelAnimationFrame(drawRafRef.current)
    },
    [],
  )

  // --- derived overlay data -------------------------------------------------

  const topics = useMemo(
    () =>
      roots.map((id, i) => ({
        id,
        name: tagById.get(id)?.name ?? id,
        index: i,
      })),
    [roots, tagById],
  )

  const selectedTag =
    selectedId != null && !selectedId.startsWith("q:")
      ? graph.tags.find((t) => t.id === selectedId)
      : undefined
  const selectedQuoteNode =
    selectedId != null && selectedId.startsWith("q:")
      ? model.nodes.find((n) => n.id === selectedId)
      : undefined

  const selectedTopic = useMemo(() => {
    if (!selectedTag) return null
    const node = model.nodes.find((n) => n.id === selectedTag.id)
    const idx = node?.cluster ?? 0
    return { name: topics[idx]?.name ?? selectedTag.name, index: idx }
  }, [selectedTag, model, topics])

  const repQuotes = useMemo(() => {
    if (!selectedTag) return [] as Quote[]
    const ids = quoteIdsForTag(graph, selectedTag.id, true)
    return quotes.filter((q) => ids.has(q.id))
  }, [selectedTag, graph, quotes])

  if (graph.tags.length === 0) {
    return (
      <EmptyState
        title="No tags to graph yet"
        description="Save a few quotes and let them get filed into Tags — your graph will grow here. You can also tag manually from the list view."
      />
    )
  }

  return (
    <div
      ref={containerRef}
      class={cx(
        "relative h-[70vh] min-h-[440px] w-full select-none overflow-hidden rounded-card border border-rule bg-paper-2",
        // Always declare a theme scope (not just for dark): when the whole app
        // is dark, the default/"light" pane must re-assert the light tokens via
        // `.light`, or it inherits `html.dark` and the canvas + chrome go dark.
        paneTheme === "dark" ? "dark" : "light",
      )}
      style={{ colorScheme: paneTheme }}
    >
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="Knowledge graph of your tags. Drag to pan, scroll to zoom, drag a node to pull it, click to pin."
        class="block h-full w-full touch-none"
        style={{ cursor: "grab" }}
        onPointerDown={(e) => onPointerDown(e as unknown as PointerEvent)}
        onPointerMove={(e) => onPointerMove(e as unknown as PointerEvent)}
        onPointerUp={(e) => endInteraction(e as unknown as PointerEvent)}
        onPointerCancel={(e) => endInteraction(e as unknown as PointerEvent)}
        onLostPointerCapture={() => cancelInteraction()}
        onPointerLeave={(e) => onPointerLeave(e as unknown as PointerEvent)}
      />

      {/* Search (top-left) + topic legend below it */}
      <div class="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-col gap-2">
        <label class="pointer-events-auto flex h-8 w-fit items-center gap-1.5 rounded-control border border-rule-2 bg-paper/90 pl-2.5 pr-1 backdrop-blur-sm focus-within:border-amber-deep focus-within:ring-[3px] focus-within:ring-amber/18">
          <Search size={13} class="shrink-0 text-muted-2" aria-hidden />
          <input
            type="text"
            value={query}
            placeholder="Search tags…"
            aria-label="Search the graph"
            onInput={(e) => {
              const val = (e.currentTarget as HTMLInputElement).value
              queryRef.current = val
              setQuery(val)
              requestDraw()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") focusFirstMatch()
              if (e.key === "Escape") {
                queryRef.current = ""
                setQuery("")
                requestDraw()
              }
            }}
            class="h-full w-40 bg-transparent text-xs text-ink placeholder:text-muted-2 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                queryRef.current = ""
                setQuery("")
                requestDraw()
              }}
              aria-label="Clear search"
              class="grid h-5 w-5 place-items-center rounded text-muted hover:text-ink"
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </label>

        {topics.length > 0 && (
          <ul class="pointer-events-auto flex max-w-[260px] flex-wrap gap-1.5">
            {topics.slice(0, 8).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(t.id)
                    const n = model.nodes.find((nn) => nn.id === t.id)
                    if (n) {
                      const v = viewRef.current
                      const k = Math.max(v.k, 1)
                      applyView({ x: -n.x * k, y: -n.y * k, k })
                    }
                  }}
                  class="inline-flex items-center gap-1.5 rounded-pill border border-rule-2 bg-paper/85 px-2 py-0.5 text-[11px] font-medium text-body backdrop-blur-sm transition-colors hover:text-ink"
                  title={`Focus “${t.name}”`}
                >
                  <span
                    class="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: clusterVarFill(t.index),
                      boxShadow: `0 0 0 1px ${clusterVarRing(t.index)}`,
                    }}
                    aria-hidden
                  />
                  {truncate(t.name, 16)}
                </button>
              </li>
            ))}
            {topics.length > 8 && (
              <li class="self-center font-mono text-[10px] uppercase tracking-mono text-muted-2">
                +{topics.length - 8}
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Detail card (right) */}
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
                        class="h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
                        title="Pinned (your edit)"
                        aria-hidden
                      />
                    )}
                  </h3>
                  {selectedTopic && (
                    <p class="mt-1 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-mono text-muted">
                      <span
                        class="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: clusterVarFill(selectedTopic.index),
                          boxShadow: `0 0 0 1px ${clusterVarRing(selectedTopic.index)}`,
                        }}
                        aria-hidden
                      />
                      {truncate(selectedTopic.name, 22)} · {repQuotes.length} quote
                      {repQuotes.length === 1 ? "" : "s"}
                    </p>
                  )}
                </>
              ) : (
                <p class="font-mono text-[10px] uppercase tracking-mono text-muted">
                  Quote
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              class="grid h-6 w-6 shrink-0 place-items-center rounded text-muted hover:text-ink"
            >
              <X size={14} aria-hidden />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
            {selectedTag ? (
              repQuotes.length === 0 ? (
                <p class="text-xs text-muted">No quotes filed here yet.</p>
              ) : (
                <ul class="flex flex-col gap-2.5">
                  {repQuotes.slice(0, 8).map((qt) => (
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
                  {repQuotes.length > 8 && (
                    <li class="text-[11px] text-muted">
                      +{repQuotes.length - 8} more
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
                      onClick={() => setSelected(t.id)}
                      class="rounded-pill border border-rule-2 px-2 py-0.5 text-[11px] font-medium text-body hover:border-amber hover:text-amber-deep"
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
              <button
                type="button"
                onClick={() => onShowInList(selectedTag.id)}
                class="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-rule-2 bg-paper text-xs font-semibold text-ink-2 transition-colors hover:bg-paper-2"
              >
                Show in list →
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTag(selectedTag.id, selectedTag.name)
                  setSelected(null)
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

      {/* Hint + cap notice (bottom-left) */}
      <div class="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5">
        {model.quotesOmitted > 0 && (
          <span class="w-fit rounded-control border border-rule-2 bg-paper/90 px-2.5 py-1 text-[11px] text-muted backdrop-blur-sm">
            Showing first {model.nodes.filter((n) => n.kind === "quote").length}{" "}
            quotes · {model.quotesOmitted} more hidden
          </span>
        )}
        <span class="hidden text-[11px] text-muted-2 sm:block">
          Drag to pan · scroll to zoom · drag a node to pull it · click to pin
        </span>
      </div>

      {/* Controls (bottom-right): scoped theme + zoom */}
      <div class="absolute bottom-3 right-3 flex items-end gap-2">
        <Segmented
          size="sm"
          value={paneTheme}
          onChange={setPaneTheme}
          items={[
            {
              value: "dark",
              ariaLabel: "Dark graph",
              label: (
                <span class="inline-flex items-center gap-1">
                  <Moon size={12} aria-hidden /> Dark
                </span>
              ),
            },
            {
              value: "light",
              ariaLabel: "Light graph",
              label: (
                <span class="inline-flex items-center gap-1">
                  <Sun size={12} aria-hidden /> Light
                </span>
              ),
            },
          ]}
        />
        <div class="flex flex-col gap-1">
          <IconBtn label="Zoom in" onClick={() => zoomBy(1.25)}>
            <Plus size={15} aria-hidden />
          </IconBtn>
          <IconBtn label="Zoom out" onClick={() => zoomBy(0.8)}>
            <Minus size={15} aria-hidden />
          </IconBtn>
          <IconBtn label="Reset view" onClick={fitToView}>
            <Maximize2 size={14} aria-hidden />
          </IconBtn>
        </div>
      </div>
    </div>
  )
}

/** Smooth label fade: always-on for the active neighborhood / search hits, else
 *  ramps in with zoom and node radius so the canvas isn't a wall of text. */
function labelOpacity(
  n: SimNode,
  k: number,
  active: string | null,
  neighbors: Set<string> | undefined,
  q: string,
): number {
  if (n.kind === "quote") return n.id === active ? 1 : 0
  if (n.id === active || (neighbors?.has(n.id) ?? false)) return 1
  if (q && n.label.toLowerCase().includes(q)) return 1
  const zoomT = clamp((k - 0.85) / 0.5, 0, 1)
  const sizeT = clamp((n.r - 9) / 8, 0, 1)
  return Math.max(zoomT, sizeT)
}

function IconBtn({
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
