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
