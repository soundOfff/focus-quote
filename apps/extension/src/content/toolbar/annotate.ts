import { icons } from "./icons"
import { tokens } from "./tokens"
import type { ToolbarShell } from "./shell"
import { apiPost } from "./api"
import type {
  CaptureVisibleTabMessage,
  CaptureVisibleTabResponse,
} from "../../shared/messages"
import type { UploadMediaResponse } from "@focus-quote/shared"

/**
 * Full-viewport annotation overlay. Activates a transparent <canvas> over the
 * page where the user can draw with their mouse / touch. Includes a small
 * inline control bar with stroke width, clear, save, and exit controls.
 *
 * "Save" captures the current viewport via `chrome.tabs.captureVisibleTab`
 * (proxied through the service worker because content scripts can't call
 * that API directly) and composites the drawing on top. Viewport-only —
 * we no longer do a full-page scroll-and-stitch.
 */

const INK = "#e94560"
const ATTR_OVERLAY = "data-focusquote-annotate-overlay"
const ATTR_CONTROLS = "data-focusquote-annotate-controls"

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
  canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:none"
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
      ctx.strokeStyle = INK
    }
  }
  sizeCanvas()
  overlay.appendChild(canvas)

  // --- drawing ---
  let drawing = false
  let lastX = 0
  let lastY = 0
  let strokeWidth = 4
  const ctx = canvas.getContext("2d")

  const pointerDown = (e: PointerEvent) => {
    if (!ctx) return
    drawing = true
    overlay.setPointerCapture(e.pointerId)
    const r = canvas.getBoundingClientRect()
    lastX = e.clientX - r.left
    lastY = e.clientY - r.top
    ctx.lineWidth = strokeWidth
    ctx.beginPath()
    ctx.arc(lastX, lastY, strokeWidth / 2, 0, Math.PI * 2)
    ctx.fillStyle = INK
    ctx.fill()
  }
  const pointerMove = (e: PointerEvent) => {
    if (!drawing || !ctx) return
    const r = canvas.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    ctx.lineWidth = strokeWidth
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

  // --- controls ---
  const controls = document.createElement("div")
  controls.setAttribute(ATTR_CONTROLS, "")
  controls.style.cssText = [
    "position:fixed",
    "top:16px",
    "left:50%",
    "transform:translateX(-50%)",
    `z-index:${tokens.zOverlay + 1}`,
    `background:${tokens.navy}`,
    `border:1px solid ${tokens.tealDim}`,
    `border-radius:${tokens.radius}`,
    "padding:6px 8px",
    "display:flex",
    "align-items:center",
    "gap:8px",
    `color:${tokens.ink}`,
    `font:${tokens.font}`,
  ].join(";")

  const label = document.createElement("span")
  label.style.cssText = `font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:${tokens.inkMute};margin-right:4px`
  label.textContent = "Annotate"

  const widthLabel = document.createElement("span")
  widthLabel.textContent = "Stroke"
  widthLabel.style.cssText = `font-size:11px;color:${tokens.inkMute}`

  const range = document.createElement("input")
  range.type = "range"
  range.min = "1"
  range.max = "20"
  range.value = String(strokeWidth)
  range.style.cssText = "width:96px"
  range.addEventListener("input", () => {
    strokeWidth = Number(range.value)
  })

  const mkBtn = (text: string, iconSvg: string, primary = false) => {
    const b = document.createElement("button")
    b.type = "button"
    b.title = text
    b.setAttribute("aria-label", text)
    b.innerHTML = `${iconSvg}<span style="margin-left:6px">${text}</span>`
    b.style.cssText = [
      "all:unset",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "padding:5px 8px",
      "border-radius:4px",
      "cursor:pointer",
      "font-size:12px",
      "font-weight:600",
      primary
        ? `background:${tokens.accent};color:#fff`
        : `color:${tokens.ink};border:1px solid ${tokens.hairline}`,
    ].join(";")
    return b
  }

  const clearBtn = mkBtn("Clear", icons.trash(14))
  clearBtn.addEventListener("click", () => {
    if (!ctx) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    ctx.scale(dpr, dpr)
  })

  const saveBtn = mkBtn("Save PNG", icons.download(14), true)
  saveBtn.addEventListener("click", () => {
    void saveComposite(overlay, canvas, controls, saveBtn)
  })

  const exitBtn = mkBtn("Exit", icons.x(14))
  exitBtn.addEventListener("click", () => onExit())

  controls.append(label, widthLabel, range, clearBtn, saveBtn, exitBtn)

  const onResize = () => {
    // Snapshot pixels, resize, then paint them back (scaled to new dims).
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
      ctx2.strokeStyle = INK
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
  trigger.innerHTML = `${icons.download(14)}<span style="margin-left:6px">Saving…</span>`
  trigger.style.pointerEvents = "none"
  // Hide our chrome from the rendered snapshot so the saved PNG looks clean.
  overlay.style.visibility = "hidden"
  controls.style.visibility = "hidden"
  try {
    // captureVisibleTab samples the next frame, so let the browser paint
    // first to ensure our overlay is gone from the snapshot.
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
    // The captured viewport is at device-pixel scale, the drawing canvas is
    // at CSS-pixel size with an internal DPR scale; drawImage with target
    // size lets the GPU resample it onto the captured frame.
    octx.drawImage(canvas, 0, 0, out.width, out.height)

    const resultDataUrl = out.toDataURL("image/png")
    downloadDataUrl(resultDataUrl, stampedFilename())
    // Persist screenshot in Turso bucket (best-effort; download still succeeds).
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
  }

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") exit()
  }

  const enter = () => {
    if (state) return
    state = createOverlay(exit)
    btn.setActive(true)
    document.addEventListener("keydown", onKeydown, true)
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
