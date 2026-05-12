import {
  DEBUG_OVERLAY_KEY,
  isDebugEnvelope,
  type DebugEvent,
  type DebugEnvelope,
} from "../shared/debug"

// ---------------- Toast (incoming messages) ----------------

interface ToastMessage {
  type: "focusquote.toast"
  message: string
  variant?: "info" | "error"
}

const isToastMessage = (msg: unknown): msg is ToastMessage => {
  if (typeof msg !== "object" || msg === null) return false
  const m = msg as Record<string, unknown>
  return m.type === "focusquote.toast" && typeof m.message === "string"
}

const showToast = (text: string, variant: "info" | "error" = "info") => {
  if (typeof document === "undefined" || !document.body) return
  const bg = variant === "error" ? "#7a1f30" : "#16213e"
  const el = document.createElement("div")
  el.textContent = text
  el.setAttribute("data-focusquote-toast", "")
  el.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:2147483647",
    `background:${bg}`,
    "color:#eaeaea",
    "padding:10px 16px",
    "border-radius:10px",
    "font:14px system-ui,-apple-system,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,.3)",
    "opacity:1",
    "transition:opacity 200ms ease",
    "pointer-events:none",
  ].join(";")
  document.body.appendChild(el)
  setTimeout(() => {
    el.style.opacity = "0"
  }, 1800)
  setTimeout(() => el.remove(), 2200)
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (!isToastMessage(msg)) return
  showToast(msg.message, msg.variant ?? "info")
})

// ---------------- Floating save button on selection ----------------

const BTN_ATTR = "data-focusquote-save"
const SAVE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`

let saveButton: HTMLButtonElement | null = null
let pendingText = ""
let isVisible = false

const createSaveButton = (): HTMLButtonElement => {
  const btn = document.createElement("button")
  btn.setAttribute(BTN_ATTR, "")
  btn.setAttribute("type", "button")
  btn.setAttribute("aria-label", "Save quote to FocusQuote")
  btn.style.cssText = [
    // reset page styles
    "all:unset",
    // positioning — fixed avoids most scroll math issues
    "position:fixed",
    "z-index:2147483646",
    // appearance
    "background:#e94560",
    "color:#ffffff",
    "border-radius:8px",
    "padding:6px 10px",
    "font:500 13px/1 system-ui,-apple-system,sans-serif",
    "cursor:pointer",
    "box-shadow:0 4px 14px rgba(0,0,0,.25)",
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    "user-select:none",
    "white-space:nowrap",
    "pointer-events:auto",
    // initial hidden state
    "opacity:0",
    "transform:translateY(-4px)",
    "transition:opacity 150ms ease,transform 150ms ease",
  ].join(";")
  btn.innerHTML = `${SAVE_ICON}<span>Save quote</span>`
  // mousedown would clear the selection before our click — preventDefault avoids that
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  btn.addEventListener("click", handleSaveClick)
  return btn
}

const ensureButton = (): HTMLButtonElement => {
  if (saveButton && saveButton.isConnected) return saveButton
  saveButton = createSaveButton()
  // attach to <html> rather than <body> so transformed/filtered body
  // ancestors can't create stacking contexts that clip us
  ;(document.documentElement || document.body).appendChild(saveButton)
  // force a reflow so the very first opacity transition actually runs
  void saveButton.offsetWidth
  return saveButton
}

const positionButton = (btn: HTMLButtonElement, rect: DOMRect) => {
  const margin = 8
  // measure now that the button is in the DOM (will be ~auto width on first call)
  const btnRect = btn.getBoundingClientRect()
  const btnW = btnRect.width > 0 ? btnRect.width : 120
  const btnH = btnRect.height > 0 ? btnRect.height : 30

  // Prefer above the selection; fall back to below if there's no room.
  const aboveTop = rect.top - btnH - margin
  const useAbove = aboveTop > 8
  const top = useAbove ? aboveTop : rect.bottom + margin

  let left = rect.left + rect.width / 2 - btnW / 2
  left = Math.max(8, Math.min(left, window.innerWidth - btnW - 8))

  btn.style.top = `${top}px`
  btn.style.left = `${left}px`
}

const showButton = (text: string, rect: DOMRect) => {
  const btn = ensureButton()
  pendingText = text
  positionButton(btn, rect)
  btn.style.opacity = "1"
  btn.style.transform = "translateY(0)"
  isVisible = true
}

const hideButton = () => {
  if (!saveButton || !isVisible) return
  saveButton.style.opacity = "0"
  saveButton.style.transform = "translateY(-4px)"
  isVisible = false
}

const isInsideOurUI = (node: Node | null): boolean => {
  let el: Node | null = node
  while (el) {
    if (el instanceof Element) {
      if (el.hasAttribute(BTN_ATTR)) return true
      if (el.hasAttribute("data-focusquote-toast")) return true
    }
    el = el.parentNode
  }
  return false
}

const checkSelection = () => {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    hideButton()
    return
  }
  const text = sel.toString().trim()
  if (text.length === 0) {
    hideButton()
    return
  }
  const range = sel.getRangeAt(0)
  if (isInsideOurUI(range.commonAncestorContainer)) return

  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    hideButton()
    return
  }
  showButton(text, rect)
}

const handleSaveClick = () => {
  if (!pendingText) return
  const payload = {
    type: "focusquote.saveQuote" as const,
    text: pendingText,
    sourceUrl: location.href,
    sourceTitle: document.title || null,
    tag: null,
  }
  chrome.runtime.sendMessage(payload).catch(() => {
    showToast("Couldn't save — extension reloaded?", "error")
  })
  pendingText = ""
  hideButton()
  // collapse the selection after saving so the button doesn't reappear
  window.getSelection()?.removeAllRanges()
}

// ---- listeners ----
//
// Strategy: SHOW only on mouseup / keyup (selection finalized).
// USE selectionchange only to HIDE when the selection collapses,
// so we don't fight the user mid-drag.

const onMouseUp = (e: MouseEvent) => {
  if (saveButton && saveButton.contains(e.target as Node)) return
  // delay so the browser has finalized the selection
  setTimeout(checkSelection, 0)
}

const onKeyUp = (e: KeyboardEvent) => {
  // shift / cmd / ctrl combos commonly used to extend selection;
  // selectionchange will catch the drop-to-zero case for us
  if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
    // also handle keyboard nav inside contenteditable
    if (
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight" &&
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return
    }
  }
  setTimeout(checkSelection, 0)
}

const onSelectionChange = () => {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    hideButton()
  }
}

const onMouseDown = (e: MouseEvent) => {
  if (saveButton && saveButton.contains(e.target as Node)) return
  hideButton()
}

document.addEventListener("mouseup", onMouseUp)
document.addEventListener("keyup", onKeyUp)
document.addEventListener("selectionchange", onSelectionChange)
document.addEventListener("mousedown", onMouseDown, true)
// capture so we react even when an inner scrollable element scrolls
window.addEventListener("scroll", hideButton, { passive: true, capture: true })
window.addEventListener("resize", hideButton, { passive: true })
window.addEventListener("blur", hideButton)

// ---------------- Debug overlay (tracker pipeline feed) ----------------
//
// Visible only while a focus session is active AND the user enabled the
// "Debug overlay" toggle in Options. The service worker / urlTracker push
// per-step events via chrome.tabs.sendMessage; we render the last N here.

const DEBUG_PANEL_ATTR = "data-focusquote-debug"
const DEBUG_MAX_EVENTS = 60

let debugPanel: HTMLDivElement | null = null
let debugList: HTMLUListElement | null = null
let debugEnabled = false
let sessionActive = false

const formatTime = (ms: number): string => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

interface RenderedEvent {
  icon: string
  tone: "ok" | "warn" | "err" | "dim" | "info"
  line1: string
  line2?: string
}

const renderEvent = (ev: DebugEvent): RenderedEvent => {
  switch (ev.type) {
    case "session:start":
      return { icon: "▶", tone: "info", line1: "session start", line2: ev.goal ?? "(no goal)" }
    case "session:end":
      return { icon: "■", tone: "info", line1: "session end" }
    case "nav:received":
      return { icon: "⇢", tone: "info", line1: "nav", line2: ev.url }
    case "nav:skip-frame":
      return { icon: "⊘", tone: "dim", line1: `subframe (id ${ev.frameId})`, line2: ev.url }
    case "nav:skip-protocol":
      return { icon: "⊘", tone: "dim", line1: "non-http", line2: ev.url }
    case "nav:skip-no-session":
      return { icon: "⊘", tone: "warn", line1: "no active session", line2: ev.url }
    case "nav:skip-invalid-url":
      return { icon: "⊘", tone: "warn", line1: "invalid URL", line2: ev.url }
    case "buffer:add":
      return {
        icon: "✓",
        tone: "ok",
        line1: `buffered (${ev.bufferLen})`,
        line2: ev.title ? `${ev.hostname} — ${ev.title}` : ev.hostname,
      }
    case "buffer:skip-privacy-off":
      return { icon: "⊘", tone: "warn", line1: "privacy off — not tracking", line2: ev.hostname }
    case "buffer:skip-blocklist":
      return { icon: "⊘", tone: "warn", line1: "blocklist", line2: ev.hostname }
    case "buffer:skip-dedupe":
      return { icon: "↺", tone: "dim", line1: "dedupe (recent dup)", line2: ev.hostname }
    case "flush:start":
      return { icon: "↑", tone: "info", line1: `flush ${ev.count} url(s)` }
    case "flush:empty":
      return { icon: "·", tone: "dim", line1: "flush: empty" }
    case "flush:posted":
      return { icon: "✓", tone: "ok", line1: `200 OK · ${ev.count} url(s) · ${ev.ms}ms` }
    case "flush:queued":
      return {
        icon: "⚠",
        tone: "err",
        line1: `flush failed · queued ${ev.count} (${ev.ms}ms)`,
        line2: ev.reason,
      }
    case "error":
      return { icon: "✕", tone: "err", line1: `error in ${ev.where}`, line2: ev.message }
    default: {
      const _: never = ev
      return { icon: "?", tone: "dim", line1: JSON.stringify(_) }
    }
  }
}

const toneColor = (tone: RenderedEvent["tone"]): string => {
  switch (tone) {
    case "ok":   return "#7dd3a8"
    case "warn": return "#f5c267"
    case "err":  return "#ff8b9b"
    case "info": return "#9bc5ff"
    case "dim":  return "#888"
  }
}

const ensureDebugPanel = (): HTMLDivElement => {
  if (debugPanel && debugPanel.isConnected) return debugPanel
  const panel = document.createElement("div")
  panel.setAttribute(DEBUG_PANEL_ATTR, "")
  panel.style.cssText = [
    "position:fixed",
    "top:50%",
    "right:16px",
    "transform:translateY(-50%)",
    "width:340px",
    "max-height:60vh",
    "z-index:2147483646",
    "background:rgba(20,22,28,0.94)",
    "color:#eaeaea",
    "border:1px solid rgba(255,255,255,0.08)",
    "border-radius:10px",
    "font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
    "box-shadow:0 12px 32px rgba(0,0,0,.45)",
    "display:flex",
    "flex-direction:column",
    "overflow:hidden",
    "pointer-events:auto",
    "backdrop-filter:blur(8px)",
  ].join(";")

  const header = document.createElement("div")
  header.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "padding:8px 12px",
    "background:rgba(255,255,255,0.04)",
    "border-bottom:1px solid rgba(255,255,255,0.06)",
    "font-size:11px",
    "letter-spacing:0.04em",
    "text-transform:uppercase",
    "color:#bcbcbc",
  ].join(";")
  const title = document.createElement("span")
  title.textContent = "FocusQuote · debug"
  const close = document.createElement("button")
  close.textContent = "×"
  close.setAttribute("aria-label", "Hide debug overlay")
  close.style.cssText = [
    "all:unset",
    "cursor:pointer",
    "color:#bcbcbc",
    "padding:0 4px",
    "font-size:16px",
    "line-height:1",
  ].join(";")
  close.addEventListener("click", () => {
    panel.remove()
    debugPanel = null
    debugList = null
  })
  header.append(title, close)

  const list = document.createElement("ul")
  list.style.cssText = [
    "list-style:none",
    "margin:0",
    "padding:6px 0",
    "overflow-y:auto",
    "flex:1",
  ].join(";")
  debugList = list

  panel.append(header, list)
  ;(document.documentElement || document.body).appendChild(panel)
  debugPanel = panel
  return panel
}

const removeDebugPanel = () => {
  if (debugPanel) {
    debugPanel.remove()
    debugPanel = null
    debugList = null
  }
}

const appendDebugEvent = (envelope: DebugEnvelope) => {
  if (!debugEnabled || !sessionActive) return
  ensureDebugPanel()
  if (!debugList) return

  const r = renderEvent(envelope.event)
  const li = document.createElement("li")
  li.style.cssText = [
    "padding:5px 12px",
    "border-bottom:1px solid rgba(255,255,255,0.04)",
    "display:grid",
    "grid-template-columns:46px 14px 1fr",
    "gap:6px",
    "align-items:start",
  ].join(";")

  const time = document.createElement("span")
  time.textContent = formatTime(envelope.at)
  time.style.cssText = "color:#777"

  const icon = document.createElement("span")
  icon.textContent = r.icon
  icon.style.cssText = `color:${toneColor(r.tone)};text-align:center`

  const body = document.createElement("div")
  const l1 = document.createElement("div")
  l1.textContent = r.line1
  l1.style.cssText = `color:${toneColor(r.tone)};word-break:break-all`
  body.appendChild(l1)
  if (r.line2) {
    const l2 = document.createElement("div")
    l2.textContent = r.line2
    l2.style.cssText = "color:#bcbcbc;font-size:11px;word-break:break-all;opacity:0.85"
    body.appendChild(l2)
  }

  li.append(time, icon, body)
  debugList.appendChild(li)

  while (debugList.children.length > DEBUG_MAX_EVENTS) {
    debugList.firstElementChild?.remove()
  }
  debugList.scrollTop = debugList.scrollHeight
}

const refreshDebugVisibility = async () => {
  const stored = await chrome.storage.local.get([
    DEBUG_OVERLAY_KEY,
    "focusquote.activeSession",
  ])
  debugEnabled = stored[DEBUG_OVERLAY_KEY] === true
  sessionActive = !!stored["focusquote.activeSession"]
  if (debugEnabled && sessionActive) {
    ensureDebugPanel()
  } else {
    removeDebugPanel()
  }
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (!isDebugEnvelope(msg)) return
  // Track session boundaries here too so we don't need to poll storage.
  if (msg.event.type === "session:start") sessionActive = true
  if (msg.event.type === "session:end") {
    appendDebugEvent(msg)
    sessionActive = false
    // Leave the panel up briefly so the user can see the final events.
    setTimeout(() => {
      if (!sessionActive) removeDebugPanel()
    }, 4000)
    return
  }
  appendDebugEvent(msg)
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  if (DEBUG_OVERLAY_KEY in changes || "focusquote.activeSession" in changes) {
    refreshDebugVisibility().catch(() => {})
  }
})

refreshDebugVisibility().catch(() => {})
