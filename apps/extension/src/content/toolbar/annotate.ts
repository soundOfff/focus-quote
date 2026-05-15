import { icons } from "./icons"
import { tokens } from "./tokens"
import type { ToolbarShell } from "./shell"
import { apiPost } from "./api"
import { setAnnotateActive } from "./tool-state"
import type {
  CaptureVisibleTabMessage,
  CaptureVisibleTabResponse,
} from "../../shared/messages"
import type { UploadMediaResponse } from "@focus-quote/shared"

/**
 * Full-viewport annotation overlay + a Direction A top toolbar.
 *
 * Overlay: a transparent <canvas> covering the viewport where the user
 * draws with mouse / touch.
 *
 * Toolbar (top of viewport, see `apps/extension/assets/design_handoff_tools/
 * COMPONENTS.md §2`):
 *   - Mode badge (amber-soft, mono ANNOTATE)
 *   - Segmented tool selector: pen / highlight / erase
 *   - 5 color swatches (amber-deep · ink · blue-ink · sage-ink · clay-ink)
 *   - Stroke slider (mono STROKE + custom slider + value readout)
 *   - Undo / Redo ghost icon buttons (snapshot-based history)
 *   - Clear (ghost destructive)
 *   - Save PNG (single amber action — captures viewport + drawing)
 *   - Exit
 *
 * "Save" captures the current viewport via `chrome.tabs.captureVisibleTab`
 * (proxied through the service worker because content scripts can't call
 * that API directly) and composites the drawing on top.
 */

const ATTR_OVERLAY = "data-focusquote-annotate-overlay"
const ATTR_CONTROLS = "data-focusquote-annotate-controls"

// Brand swatches per the spec (in display order). The first is "active" by
// default to match the handoff anatomy diagram.
const SWATCHES = [
  { id: "amber" as const, color: tokens.amberDeep },
  { id: "ink" as const, color: tokens.ink },
  { id: "blue" as const, color: tokens.blueInk },
  { id: "sage" as const, color: tokens.sageInk },
  { id: "clay" as const, color: tokens.clayInk },
]
type SwatchId = (typeof SWATCHES)[number]["id"]

type ToolMode = "pen" | "highlight" | "erase"

interface OverlayState {
  overlay: HTMLDivElement
  canvas: HTMLCanvasElement
  controls: HTMLDivElement
  dispose: () => void
}

const createOverlay = (onExit: () => void): OverlayState => {
  const overlay = document.createElement("div")
  overlay.setAttribute(ATTR_OVERLAY, "")
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "top:0",
    "left:0",
    "width:100vw",
    "height:100vh",
    `z-index:${tokens.zOverlay}`,
    "background:transparent",
    "cursor:crosshair",
  ].join(";")

  const canvas = document.createElement("canvas")
  canvas.style.cssText =
    "width:100%;height:100%;display:block;touch-action:none"
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const sizeCanvas = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.strokeStyle = tool.color
    }
  }

  // --- drawing state ---
  const tool: {
    mode: ToolMode
    swatch: SwatchId
    color: string
    strokeWidth: number
  } = {
    mode: "pen",
    swatch: "amber",
    color: tokens.amberDeep,
    strokeWidth: 3.2,
  }
  // Undo/redo stack stores a single-frame PNG dataURL captured at the end
  // of each stroke. Cap to avoid eating unbounded memory on long sessions.
  const undoStack: string[] = []
  const redoStack: string[] = []
  const HISTORY_CAP = 25

  sizeCanvas()
  overlay.appendChild(canvas)

  const ctx = canvas.getContext("2d")
  let drawing = false
  let lastX = 0
  let lastY = 0

  const applyToolToCtx = () => {
    if (!ctx) return
    ctx.lineWidth = tool.strokeWidth
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    if (tool.mode === "erase") {
      ctx.globalCompositeOperation = "destination-out"
      ctx.globalAlpha = 1
      ctx.strokeStyle = "rgba(0,0,0,1)"
      ctx.fillStyle = "rgba(0,0,0,1)"
    } else if (tool.mode === "highlight") {
      ctx.globalCompositeOperation = "source-over"
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = tool.color
      ctx.fillStyle = tool.color
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.globalAlpha = 1
      ctx.strokeStyle = tool.color
      ctx.fillStyle = tool.color
    }
  }

  const snapshot = (): string | null => {
    try {
      return canvas.toDataURL("image/png")
    } catch {
      return null
    }
  }

  const pushUndoSnapshot = () => {
    const snap = snapshot()
    if (!snap) return
    undoStack.push(snap)
    if (undoStack.length > HISTORY_CAP) undoStack.shift()
    // Any new stroke invalidates the redo lane.
    redoStack.length = 0
    syncHistoryButtons()
  }

  const restoreFromDataUrl = (dataUrl: string) => {
    if (!ctx) return
    const img = new Image()
    img.onload = () => {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = "source-over"
      ctx.globalAlpha = 1
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      ctx.restore()
      ctx.scale(dpr, dpr)
      applyToolToCtx()
    }
    img.src = dataUrl
  }

  const undo = () => {
    if (undoStack.length === 0) return
    const current = snapshot()
    if (current) redoStack.push(current)
    const prev = undoStack.pop()!
    restoreFromDataUrl(prev)
    syncHistoryButtons()
  }
  const redo = () => {
    if (redoStack.length === 0) return
    const current = snapshot()
    if (current) undoStack.push(current)
    const next = redoStack.pop()!
    restoreFromDataUrl(next)
    syncHistoryButtons()
  }

  const pointerDown = (e: PointerEvent) => {
    if (!ctx) return
    pushUndoSnapshot()
    drawing = true
    overlay.setPointerCapture(e.pointerId)
    const r = canvas.getBoundingClientRect()
    lastX = e.clientX - r.left
    lastY = e.clientY - r.top
    applyToolToCtx()
    ctx.beginPath()
    ctx.arc(lastX, lastY, tool.strokeWidth / 2, 0, Math.PI * 2)
    ctx.fill()
  }
  const pointerMove = (e: PointerEvent) => {
    if (!drawing || !ctx) return
    const r = canvas.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    applyToolToCtx()
    ctx.beginPath()
    ctx.moveTo(lastX, lastY)
    ctx.lineTo(x, y)
    ctx.stroke()
    lastX = x
    lastY = y
  }
  const pointerUp = (e: PointerEvent) => {
    drawing = false
    try {
      overlay.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  overlay.addEventListener("pointerdown", pointerDown)
  overlay.addEventListener("pointermove", pointerMove)
  overlay.addEventListener("pointerup", pointerUp)
  overlay.addEventListener("pointercancel", pointerUp)

  // ---------------- Controls (Direction A top toolbar) -------------------

  const controls = document.createElement("div")
  controls.setAttribute(ATTR_CONTROLS, "")
  controls.style.cssText = [
    "position:fixed",
    "top:16px",
    "left:50%",
    "transform:translateX(-50%)",
    `z-index:${tokens.zOverlay + 1}`,
    "display:inline-flex",
    "align-items:stretch",
    `background:${tokens.paper}`,
    `border:1px solid ${tokens.popupBorder}`,
    `border-radius:${tokens.radiusMd}`,
    "padding:5px",
    "gap:4px",
    `box-shadow:${tokens.shadowToolbar}`,
    `color:${tokens.ink}`,
    `font:${tokens.font}`,
  ].join(";")

  // Mode badge (amber-soft) ---------------------------------------------
  const badge = document.createElement("div")
  badge.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "gap:7px",
    "padding:5px 10px 5px 9px",
    `background:${tokens.amberSoft}`,
    `border:1px solid ${tokens.amberHairline}`,
    `border-radius:${tokens.radius}`,
  ].join(";")
  const badgePen = document.createElement("span")
  badgePen.style.cssText = `display:inline-flex;color:${tokens.amberDeep}`
  badgePen.innerHTML = icons.pencil(13)
  const badgeLabel = document.createElement("span")
  badgeLabel.style.cssText = [
    `font:${tokens.fontMono}`,
    "font-size:10px",
    "font-weight:600",
    "letter-spacing:0.12em",
    "text-transform:uppercase",
    `color:${tokens.amberDeep}`,
  ].join(";")
  badgeLabel.textContent = "Annotate"
  badge.append(badgePen, badgeLabel)

  // Tool selector segmented (pen / highlight / erase) ---------------------
  const toolSelector = document.createElement("div")
  toolSelector.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    `background:${tokens.paper2}`,
    `border:1px solid ${tokens.rule}`,
    `border-radius:${tokens.radius}`,
    "padding:2px",
    "gap:2px",
  ].join(";")
  const toolButtons = new Map<ToolMode, HTMLButtonElement>()
  const setToolMode = (mode: ToolMode) => {
    tool.mode = mode
    for (const [m, b] of toolButtons.entries()) {
      const active = m === mode
      b.style.background = active ? tokens.paper : "transparent"
      b.style.borderColor = active ? tokens.popupBorder : "transparent"
      b.style.color = active ? tokens.ink : tokens.muted
      b.style.boxShadow = active ? tokens.shadowSegmented : "none"
    }
    applyToolToCtx()
  }
  const mkToolBtn = (mode: ToolMode, svg: string, label: string) => {
    const b = document.createElement("button")
    b.type = "button"
    b.title = label
    b.setAttribute("aria-label", label)
    b.style.cssText = [
      "all:unset",
      "box-sizing:border-box",
      "display:grid",
      "place-items:center",
      "width:26px",
      "height:24px",
      "border-radius:5px",
      "cursor:pointer",
      "border:1px solid transparent",
      `color:${tokens.muted}`,
      "transition:background-color 120ms ease,color 120ms ease,border-color 120ms ease",
    ].join(";")
    b.innerHTML = svg
    b.addEventListener("click", () => setToolMode(mode))
    toolButtons.set(mode, b)
    return b
  }
  toolSelector.append(
    mkToolBtn("pen", icons.pencil(12), "Pen"),
    mkToolBtn("highlight", icons.bolt(12), "Highlight"),
    mkToolBtn("erase", icons.x(12), "Erase"),
  )

  // Color swatches -------------------------------------------------------
  const swatchRow = document.createElement("div")
  swatchRow.style.cssText =
    "display:inline-flex;align-items:center;gap:4px;padding:0 4px"
  const swatchButtons = new Map<SwatchId, HTMLButtonElement>()
  const setSwatch = (id: SwatchId) => {
    const next = SWATCHES.find((s) => s.id === id)
    if (!next) return
    tool.swatch = id
    tool.color = next.color
    for (const [sid, btn] of swatchButtons.entries()) {
      const active = sid === id
      btn.style.border = active
        ? `2px solid ${tokens.paper}`
        : "2px solid transparent"
      const swatchColor =
        SWATCHES.find((s) => s.id === sid)?.color ?? tokens.rule
      btn.style.outline = active
        ? `1px solid ${swatchColor}`
        : `1px solid ${tokens.rule}`
    }
    applyToolToCtx()
  }
  for (const s of SWATCHES) {
    const b = document.createElement("button")
    b.type = "button"
    b.title = `Color: ${s.id}`
    b.setAttribute("aria-label", `Color ${s.id}`)
    b.style.cssText = [
      "all:unset",
      "box-sizing:border-box",
      "width:16px",
      "height:16px",
      `border-radius:${tokens.radiusPill}`,
      `background:${s.color}`,
      "cursor:pointer",
      "border:2px solid transparent",
      `outline:1px solid ${tokens.rule}`,
      "outline-offset:0",
      "transition:outline-color 120ms ease,border-color 120ms ease",
    ].join(";")
    b.addEventListener("click", () => setSwatch(s.id))
    swatchButtons.set(s.id, b)
    swatchRow.appendChild(b)
  }

  // Stroke slider --------------------------------------------------------
  const sliderWrap = document.createElement("div")
  sliderWrap.style.cssText =
    "display:inline-flex;align-items:center;gap:8px;padding:0 10px 0 4px"
  const sliderLabel = document.createElement("span")
  sliderLabel.style.cssText = [
    `font:${tokens.fontMono}`,
    "font-size:9.5px",
    "font-weight:500",
    "letter-spacing:0.12em",
    "text-transform:uppercase",
    `color:${tokens.muted}`,
  ].join(";")
  sliderLabel.textContent = "Stroke"

  const STROKE_MIN = 1
  const STROKE_MAX = 12
  const sliderTrackWrap = document.createElement("div")
  sliderTrackWrap.style.cssText = [
    "position:relative",
    "width:96px",
    "height:18px",
    "display:flex",
    "align-items:center",
    "cursor:pointer",
    "touch-action:none",
  ].join(";")
  const track = document.createElement("div")
  track.style.cssText = `position:absolute;inset:8px 0;height:2px;background:${tokens.rule};border-radius:99px`
  const fill = document.createElement("div")
  fill.style.cssText = `position:absolute;left:0;top:8px;height:2px;background:${tokens.amberDeep};border-radius:99px`
  const thumb = document.createElement("div")
  thumb.style.cssText = [
    "position:absolute",
    "top:2px",
    "width:14px",
    "height:14px",
    `border-radius:${tokens.radiusPill}`,
    `background:${tokens.paper}`,
    `border:1px solid ${tokens.amberDeep}`,
    "box-shadow:0 1px 2px rgba(40,30,15,0.15)",
  ].join(";")
  const valueLabel = document.createElement("span")
  valueLabel.style.cssText = [
    `font:${tokens.fontMono}`,
    "font-size:11px",
    "font-weight:500",
    `color:${tokens.ink2}`,
    "min-width:22px",
    "text-align:right",
  ].join(";")

  const renderStrokeSlider = () => {
    const pct = Math.max(
      0,
      Math.min(
        100,
        ((tool.strokeWidth - STROKE_MIN) / (STROKE_MAX - STROKE_MIN)) * 100,
      ),
    )
    fill.style.width = `${pct}%`
    thumb.style.left = `calc(${pct}% - 7px)`
    valueLabel.textContent = tool.strokeWidth.toFixed(1)
  }
  const setStrokeFromClientX = (clientX: number) => {
    const r = sliderTrackWrap.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    tool.strokeWidth = +(
      STROKE_MIN + ratio * (STROKE_MAX - STROKE_MIN)
    ).toFixed(1)
    renderStrokeSlider()
    applyToolToCtx()
  }
  let dragging = false
  sliderTrackWrap.addEventListener("pointerdown", (e) => {
    dragging = true
    sliderTrackWrap.setPointerCapture(e.pointerId)
    setStrokeFromClientX(e.clientX)
  })
  sliderTrackWrap.addEventListener("pointermove", (e) => {
    if (!dragging) return
    setStrokeFromClientX(e.clientX)
  })
  const sliderPointerUp = (e: PointerEvent) => {
    dragging = false
    try {
      sliderTrackWrap.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  sliderTrackWrap.addEventListener("pointerup", sliderPointerUp)
  sliderTrackWrap.addEventListener("pointercancel", sliderPointerUp)

  sliderTrackWrap.append(track, fill, thumb)
  sliderWrap.append(sliderLabel, sliderTrackWrap, valueLabel)

  // Dividers + actions ---------------------------------------------------
  const divider = (): HTMLDivElement => {
    const d = document.createElement("div")
    d.style.cssText = `width:1px;background:${tokens.rule};margin:4px 1px`
    return d
  }

  const ghostIconBtn = (svg: string, label: string, onClick: () => void) => {
    const b = document.createElement("button")
    b.type = "button"
    b.title = label
    b.setAttribute("aria-label", label)
    b.innerHTML = svg
    b.style.cssText = [
      "all:unset",
      "box-sizing:border-box",
      "display:grid",
      "place-items:center",
      "width:28px",
      "height:28px",
      "border:1px solid transparent",
      "border-radius:6px",
      `color:${tokens.ink2}`,
      "cursor:pointer",
      "transition:background-color 120ms ease,border-color 120ms ease,opacity 120ms ease",
    ].join(";")
    b.addEventListener("mouseenter", () => {
      b.style.backgroundColor = tokens.paper2
    })
    b.addEventListener("mouseleave", () => {
      b.style.backgroundColor = "transparent"
    })
    b.addEventListener("click", onClick)
    return b
  }
  const undoBtn = ghostIconBtn(icons.undo(13), "Undo", undo)
  const redoBtn = ghostIconBtn(icons.undo(13), "Redo", redo)
  // Mirror the undo icon for redo per the handoff.
  ;(redoBtn.firstElementChild as SVGElement | null)?.setAttribute(
    "style",
    "transform:scaleX(-1)",
  )

  const syncHistoryButtons = () => {
    undoBtn.style.opacity = undoStack.length === 0 ? "0.4" : "1"
    undoBtn.style.pointerEvents = undoStack.length === 0 ? "none" : "auto"
    redoBtn.style.opacity = redoStack.length === 0 ? "0.4" : "1"
    redoBtn.style.pointerEvents = redoStack.length === 0 ? "none" : "auto"
  }

  // Clear (ghost destructive) -------------------------------------------
  const clearBtn = document.createElement("button")
  clearBtn.type = "button"
  clearBtn.title = "Clear annotations"
  clearBtn.setAttribute("aria-label", "Clear")
  clearBtn.innerHTML = `${icons.trash(12)}<span style="margin-left:5px">Clear</span>`
  clearBtn.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "display:inline-flex",
    "align-items:center",
    "gap:5px",
    "padding:6px 10px",
    `background:${tokens.paper2}`,
    `border:1px solid ${tokens.clayHairline}`,
    `border-radius:${tokens.radius}`,
    `color:${tokens.clayInk}`,
    "font-size:12px",
    "font-weight:500",
    "cursor:pointer",
    "white-space:nowrap",
    "transition:background-color 120ms ease",
  ].join(";")
  clearBtn.addEventListener("mouseenter", () => {
    clearBtn.style.backgroundColor = tokens.claySoft
  })
  clearBtn.addEventListener("mouseleave", () => {
    clearBtn.style.backgroundColor = tokens.paper2
  })
  clearBtn.addEventListener("click", () => {
    if (!ctx) return
    pushUndoSnapshot()
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = "source-over"
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    ctx.scale(dpr, dpr)
    applyToolToCtx()
  })

  // Save PNG (single amber action) --------------------------------------
  const saveBtn = document.createElement("button")
  saveBtn.type = "button"
  saveBtn.title = "Save PNG"
  saveBtn.setAttribute("aria-label", "Save PNG")
  saveBtn.innerHTML = `${icons.download(12)}<span style="margin-left:6px">Save PNG</span>`
  saveBtn.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "display:inline-flex",
    "align-items:center",
    "padding:6px 11px",
    `background:${tokens.amberGradient}`,
    `color:#2A1A05`,
    `border:1px solid ${tokens.amberDeep}`,
    `border-radius:${tokens.radius}`,
    `box-shadow:${tokens.shadowAmber}`,
    "font-size:12px",
    "font-weight:600",
    "letter-spacing:-0.005em",
    "cursor:pointer",
    "white-space:nowrap",
    "transition:filter 120ms ease",
  ].join(";")
  saveBtn.addEventListener("mouseenter", () => {
    saveBtn.style.filter = "brightness(1.03)"
  })
  saveBtn.addEventListener("mouseleave", () => {
    saveBtn.style.filter = "none"
  })
  saveBtn.addEventListener("click", () => {
    void saveComposite(overlay, canvas, controls, saveBtn)
  })

  // Exit (ghost) ---------------------------------------------------------
  const exitBtn = document.createElement("button")
  exitBtn.type = "button"
  exitBtn.title = "Exit annotate mode"
  exitBtn.setAttribute("aria-label", "Exit")
  exitBtn.innerHTML = `${icons.x(12)}<span style="margin-left:5px">Exit</span>`
  exitBtn.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "display:inline-flex",
    "align-items:center",
    "padding:6px 9px",
    `background:${tokens.paper2}`,
    `border:1px solid ${tokens.rule}`,
    `border-radius:${tokens.radius}`,
    `color:${tokens.ink2}`,
    "font-size:12px",
    "font-weight:500",
    "cursor:pointer",
    "white-space:nowrap",
    "transition:background-color 120ms ease",
  ].join(";")
  exitBtn.addEventListener("mouseenter", () => {
    exitBtn.style.backgroundColor = tokens.paper
  })
  exitBtn.addEventListener("mouseleave", () => {
    exitBtn.style.backgroundColor = tokens.paper2
  })
  exitBtn.addEventListener("click", () => onExit())

  // Assemble toolbar in the order specified by the handoff:
  // badge · divider · tool selector · swatches · stroke · divider · undo · redo · clear · save · divider · exit
  controls.append(
    badge,
    divider(),
    toolSelector,
    swatchRow,
    sliderWrap,
    divider(),
    undoBtn,
    redoBtn,
    clearBtn,
    saveBtn,
    divider(),
    exitBtn,
  )

  // Initial state sync.
  setToolMode("pen")
  setSwatch("amber")
  renderStrokeSlider()
  syncHistoryButtons()

  const onResize = () => {
    if (!ctx) return
    const prev = document.createElement("canvas")
    prev.width = canvas.width
    prev.height = canvas.height
    const pctx = prev.getContext("2d")
    if (pctx) pctx.drawImage(canvas, 0, 0)
    sizeCanvas()
    const ctx2 = canvas.getContext("2d")
    if (ctx2 && pctx) {
      ctx2.save()
      ctx2.setTransform(1, 0, 0, 1, 0, 0)
      ctx2.drawImage(prev, 0, 0, canvas.width, canvas.height)
      ctx2.restore()
      ctx2.scale(dpr, dpr)
      ctx2.lineCap = "round"
      ctx2.lineJoin = "round"
      applyToolToCtx()
    }
  }
  window.addEventListener("resize", onResize)

  ;(document.documentElement || document.body).appendChild(overlay)
  ;(document.documentElement || document.body).appendChild(controls)

  return {
    overlay,
    canvas,
    controls,
    dispose: () => {
      window.removeEventListener("resize", onResize)
      overlay.remove()
      controls.remove()
    },
  }
}

// ---------------- Save composite (captureVisibleTab + draw) ----------------

const captureViewport = (): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const message: CaptureVisibleTabMessage = {
      type: "focusquote.captureVisibleTab",
      format: "png",
    }
    try {
      chrome.runtime.sendMessage(message, (res: CaptureVisibleTabResponse) => {
        const err = chrome.runtime.lastError
        if (err) {
          reject(new Error(err.message ?? "Background worker unreachable"))
          return
        }
        if (!res) {
          reject(new Error("Empty response from background worker"))
          return
        }
        if (!res.ok) {
          reject(new Error(res.error))
          return
        }
        resolve(res.dataUrl)
      })
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Failed to decode capture"))
    img.src = src
  })

const downloadDataUrl = (dataUrl: string, filename: string): void => {
  const a = document.createElement("a")
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const getActiveSessionId = async (): Promise<string | null> => {
  try {
    const out = await chrome.storage.local.get("focusquote.activeSession")
    const active = out?.["focusquote.activeSession"]
    if (!active || typeof active !== "object") return null
    const id = (active as { sessionId?: unknown }).sessionId
    return typeof id === "string" ? id : null
  } catch {
    return null
  }
}

const uploadScreenshot = async (dataUrl: string): Promise<void> => {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(dataUrl)
  if (!match) return
  const mimeType = match[1]!.toLowerCase()
  const dataBase64 = match[2]!
  const byteSize = Math.floor((dataBase64.length * 3) / 4)
  const sessionId = await getActiveSessionId()
  await apiPost<UploadMediaResponse>("/api/media", {
    kind: "screenshot",
    mimeType,
    dataBase64,
    byteSize,
    sessionId,
  })
}

const stampedFilename = (): string => {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19)
  return `focusquote-annotation-${stamp}.png`
}

const saveComposite = async (
  overlay: HTMLDivElement,
  canvas: HTMLCanvasElement,
  controls: HTMLDivElement,
  trigger: HTMLButtonElement,
): Promise<void> => {
  const prevLabel = trigger.innerHTML
  trigger.innerHTML = `${icons.download(12)}<span style="margin-left:6px">Saving…</span>`
  trigger.style.pointerEvents = "none"
  overlay.style.visibility = "hidden"
  controls.style.visibility = "hidden"
  try {
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    const dataUrl = await captureViewport()
    const img = await loadImage(dataUrl)

    const out = document.createElement("canvas")
    out.width = img.naturalWidth
    out.height = img.naturalHeight
    const octx = out.getContext("2d")
    if (!octx) throw new Error("2d context unavailable")
    octx.drawImage(img, 0, 0)
    octx.drawImage(canvas, 0, 0, out.width, out.height)

    const resultDataUrl = out.toDataURL("image/png")
    downloadDataUrl(resultDataUrl, stampedFilename())
    void uploadScreenshot(resultDataUrl).catch((err) =>
      console.warn("[FocusQuote] screenshot upload failed:", err),
    )
  } catch (err) {
    console.warn("[FocusQuote] annotation save failed:", err)
    alert(
      "Couldn't capture the viewport. The drawing alone will still be saved.",
    )
    const fallbackDataUrl = canvas.toDataURL("image/png")
    downloadDataUrl(fallbackDataUrl, stampedFilename())
    void uploadScreenshot(fallbackDataUrl).catch((uploadErr) =>
      console.warn("[FocusQuote] screenshot upload failed:", uploadErr),
    )
  } finally {
    overlay.style.visibility = "visible"
    controls.style.visibility = "visible"
    trigger.innerHTML = prevLabel
    trigger.style.pointerEvents = "auto"
  }
}

export const installAnnotateButton = (
  shell: ToolbarShell,
): (() => void) => {
  let state: OverlayState | null = null

  const exit = () => {
    state?.dispose()
    state = null
    btn.setActive(false)
    document.removeEventListener("keydown", onKeydown, true)
    setAnnotateActive(false)
  }

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") exit()
  }

  const enter = () => {
    if (state) return
    state = createOverlay(exit)
    btn.setActive(true)
    document.addEventListener("keydown", onKeydown, true)
    setAnnotateActive(true)
  }

  const btn = shell.addButton({
    id: "annotate",
    label: "Annotate page",
    icon: icons.pencil(tokens.icon.md),
    onClick: () => {
      if (state) exit()
      else enter()
    },
  })

  return () => exit()
}
