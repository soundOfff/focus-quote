import {
  DEBUG_OVERLAY_KEY,
  isDebugEnvelope,
  type DebugEvent,
  type DebugEnvelope,
} from "../shared/debug"
import { initFocusToolbar } from "./toolbar"
import { mountActionCapture } from "./actionCapture"
import { extractPageContent } from "./pageContent"

// Floating focus-mode toolbar (only renders while a session is active).
initFocusToolbar()

const SESSION_KEY = "focusquote.activeSession"
const PRIVACY_KEY = "focusquote.privacy"

type ActiveSession = { sessionId: string } | null
type Privacy = { trackUrls: boolean; blocklist: string[] }

let activeSession: ActiveSession = null
let privacy: Privacy = { trackUrls: false, blocklist: [] }

const isBlockedHost = (hostname: string): boolean => {
  const h = hostname.toLowerCase()
  return privacy.blocklist.some((entry) => {
    const e = entry.toLowerCase().trim()
    if (!e) return false
    return h === e || h.endsWith(`.${e}`)
  })
}

const shouldTrackUrl = (url: URL): boolean =>
  privacy.trackUrls && !isBlockedHost(url.hostname)

const refreshSessionAndPrivacy = async () => {
  const out = await chrome.storage.local.get([SESSION_KEY, PRIVACY_KEY])
  activeSession = (out[SESSION_KEY] as ActiveSession) ?? null
  const nextPrivacy = out[PRIVACY_KEY]
  if (
    nextPrivacy &&
    typeof nextPrivacy === "object" &&
    "trackUrls" in nextPrivacy &&
    "blocklist" in nextPrivacy
  ) {
    privacy = nextPrivacy as Privacy
  }
}

const injectSpaNavScript = () => {
  const id = "focusquote-spa-nav-injector"
  if (document.getElementById(id)) return
  const script = document.createElement("script")
  script.id = id
  script.src = chrome.runtime.getURL("src/content/spaNavInjector.ts")
  script.async = false
  script.onload = () => script.remove()
  ;(document.documentElement || document.head || document.body)?.appendChild(script)
}

const sendSpaNav = (url: string) => {
  if (!activeSession) return
  const content = extractPageContent()
  chrome.runtime
    .sendMessage({
      type: "focusquote.spa-nav",
      url,
      title: content.title,
      content: content.content,
    })
    .catch(() => {})
}

injectSpaNavScript()
window.addEventListener("message", (event) => {
  const data = event.data as { source?: string; type?: string; url?: string }
  if (event.source !== window) return
  if (!data || data.source !== "focusquote" || data.type !== "spa-nav") return
  if (typeof data.url !== "string") return
  sendSpaNav(data.url)
})

const unmountActionCapture = mountActionCapture({
  getSessionId: () => activeSession?.sessionId ?? null,
  shouldTrackUrl,
  onAction: (event) => {
    chrome.runtime.sendMessage({
      type: "focusquote.action",
      sessionId: event.sessionId,
      actionKind: event.actionKind,
      payload: event.payload,
      at: event.at,
    })
  },
})

void refreshSessionAndPrivacy().then(() => {
  if (activeSession) sendSpaNav(location.href)
})
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  if (SESSION_KEY in changes || PRIVACY_KEY in changes) {
    void refreshSessionAndPrivacy()
  }
})
window.addEventListener("beforeunload", () => {
  unmountActionCapture()
})

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

// ---------------- Floating save row on selection ----------------
//
// The widget that pops up next to a text selection has two jobs: save the
// quote and translate it inline. The Save button + From/To selects + a
// translate icon all live on the same row, with a thin result card hanging
// directly beneath when a translation succeeds. There's no popover — once
// the selection collapses, the whole row disappears together.

const ROW_ATTR = "data-focusquote-save"
const SAVE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`
const TRANSLATE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`

const LANG_FROM_KEY = "focusquote.translate.from"
const LANG_TO_KEY = "focusquote.translate.to"
const MYMEMORY_LIMIT = 500

interface LanguageOption {
  code: string
  label: string
}

// Order matters — these mirror the language list in the plan and are shown
// in this order in the dropdowns. `auto` is only valid for the "from" side.
const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
]

interface SaveRow {
  root: HTMLDivElement
  saveBtn: HTMLButtonElement
  resultCard: HTMLDivElement
  fromSelect: HTMLSelectElement
  toSelect: HTMLSelectElement
  translateBtn: HTMLButtonElement
}

let saveRow: SaveRow | null = null
let pendingText = ""
let isVisible = false
let currentTranslateAbort: AbortController | null = null

const readPref = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
const writePref = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode etc. */
  }
}

const styleSelect = (sel: HTMLSelectElement): void => {
  sel.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "appearance:auto",
    "background:rgba(255,255,255,0.12)",
    "color:#ffffff",
    "border:1px solid rgba(255,255,255,0.18)",
    "border-radius:6px",
    "padding:3px 4px",
    "font:500 12px/1 system-ui,-apple-system,sans-serif",
    "cursor:pointer",
    "max-width:96px",
  ].join(";")
}

const styleIconButton = (btn: HTMLButtonElement): void => {
  btn.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:24px",
    "height:24px",
    "border-radius:6px",
    "color:#ffffff",
    "background:rgba(255,255,255,0.10)",
    "cursor:pointer",
    "transition:background-color 120ms ease",
  ].join(";")
  btn.addEventListener("mouseenter", () => {
    btn.style.backgroundColor = "rgba(255,255,255,0.20)"
  })
  btn.addEventListener("mouseleave", () => {
    btn.style.backgroundColor = "rgba(255,255,255,0.10)"
  })
}

const createSaveRow = (): SaveRow => {
  const root = document.createElement("div")
  root.setAttribute(ROW_ATTR, "")
  root.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    "display:flex",
    "flex-direction:column",
    "align-items:stretch",
    "gap:6px",
    "user-select:none",
    "pointer-events:auto",
    "opacity:0",
    "transform:translateY(-4px)",
    "transition:opacity 150ms ease,transform 150ms ease",
    "font:500 13px/1 system-ui,-apple-system,sans-serif",
  ].join(";")
  // Stop mousedown from collapsing the selection before our click handlers run.
  root.addEventListener("mousedown", (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  const row = document.createElement("div")
  row.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    "background:#e94560",
    "color:#ffffff",
    "border-radius:8px",
    "padding:6px 8px",
    "box-shadow:0 4px 14px rgba(0,0,0,.25)",
    "white-space:nowrap",
  ].join(";")
  root.appendChild(row)

  const saveBtn = document.createElement("button")
  saveBtn.type = "button"
  saveBtn.setAttribute("aria-label", "Save quote to FocusQuote")
  saveBtn.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    "padding:2px 4px",
    "border-radius:4px",
    "cursor:pointer",
    "color:#ffffff",
  ].join(";")
  saveBtn.innerHTML = `${SAVE_ICON}<span>Save quote</span>`
  saveBtn.addEventListener("click", handleSaveClick)
  row.appendChild(saveBtn)

  // Visual divider between Save and the inline Translate group.
  const sep = document.createElement("span")
  sep.style.cssText =
    "width:1px;height:18px;background:rgba(255,255,255,0.30);margin:0 2px"
  row.appendChild(sep)

  const fromSelect = document.createElement("select")
  fromSelect.setAttribute("aria-label", "Translate from")
  fromSelect.title = "Translate from"
  styleSelect(fromSelect)
  {
    const autoOpt = document.createElement("option")
    autoOpt.value = "auto"
    autoOpt.textContent = "Auto"
    fromSelect.appendChild(autoOpt)
    for (const lang of LANGUAGES) {
      const opt = document.createElement("option")
      opt.value = lang.code
      opt.textContent = lang.label
      fromSelect.appendChild(opt)
    }
  }
  const initialFrom = readPref(LANG_FROM_KEY, "auto")
  fromSelect.value = LANGUAGES.some((l) => l.code === initialFrom) || initialFrom === "auto"
    ? initialFrom
    : "auto"
  fromSelect.addEventListener("change", () => {
    writePref(LANG_FROM_KEY, fromSelect.value)
  })
  row.appendChild(fromSelect)

  const arrow = document.createElement("span")
  arrow.textContent = "→"
  arrow.style.cssText = "opacity:0.7;font-size:12px"
  row.appendChild(arrow)

  const toSelect = document.createElement("select")
  toSelect.setAttribute("aria-label", "Translate to")
  toSelect.title = "Translate to"
  styleSelect(toSelect)
  for (const lang of LANGUAGES) {
    const opt = document.createElement("option")
    opt.value = lang.code
    opt.textContent = lang.label
    toSelect.appendChild(opt)
  }
  const initialTo = readPref(LANG_TO_KEY, "en")
  toSelect.value = LANGUAGES.some((l) => l.code === initialTo) ? initialTo : "en"
  toSelect.addEventListener("change", () => {
    writePref(LANG_TO_KEY, toSelect.value)
  })
  row.appendChild(toSelect)

  const translateBtn = document.createElement("button")
  translateBtn.type = "button"
  translateBtn.setAttribute("aria-label", "Translate selection")
  translateBtn.title = "Translate selection"
  styleIconButton(translateBtn)
  translateBtn.innerHTML = TRANSLATE_ICON
  translateBtn.addEventListener("click", handleTranslateClick)
  row.appendChild(translateBtn)

  const resultCard = document.createElement("div")
  resultCard.style.cssText = [
    "display:none",
    "max-width:360px",
    "background:#16213e",
    "color:#eaeaea",
    "border:1px solid rgba(45,212,191,0.5)",
    "border-radius:6px",
    "padding:8px 10px",
    "font:13px/1.5 system-ui,-apple-system,sans-serif",
    "white-space:pre-wrap",
    "word-break:break-word",
    "max-height:200px",
    "overflow:auto",
  ].join(";")
  root.appendChild(resultCard)

  return { root, saveBtn, resultCard, fromSelect, toSelect, translateBtn }
}

const ensureRow = (): SaveRow => {
  if (saveRow && saveRow.root.isConnected) return saveRow
  saveRow = createSaveRow()
  // Attach to <html> so transformed/filtered body ancestors can't clip us.
  ;(document.documentElement || document.body).appendChild(saveRow.root)
  void saveRow.root.offsetWidth // force reflow for first transition
  return saveRow
}

const positionRow = (row: SaveRow, rect: DOMRect) => {
  const margin = 8
  const r = row.root.getBoundingClientRect()
  const w = r.width > 0 ? r.width : 320
  const h = r.height > 0 ? r.height : 36
  const aboveTop = rect.top - h - margin
  const useAbove = aboveTop > 8
  const top = useAbove ? aboveTop : rect.bottom + margin
  let left = rect.left + rect.width / 2 - w / 2
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
  row.root.style.top = `${top}px`
  row.root.style.left = `${left}px`
}

const showRow = (text: string, rect: DOMRect) => {
  const row = ensureRow()
  pendingText = text
  // Re-measure after content (text length affects width).
  positionRow(row, rect)
  // Run a second pass on the next frame in case the browser hasn't finalized
  // intrinsic widths of the selects yet.
  requestAnimationFrame(() => positionRow(row, rect))
  row.root.style.opacity = "1"
  row.root.style.transform = "translateY(0)"
  isVisible = true
}

const hideRow = () => {
  if (!saveRow || !isVisible) return
  saveRow.root.style.opacity = "0"
  saveRow.root.style.transform = "translateY(-4px)"
  // Reset translate UI so it doesn't flash stale content next time.
  saveRow.resultCard.style.display = "none"
  saveRow.resultCard.textContent = ""
  currentTranslateAbort?.abort()
  currentTranslateAbort = null
  isVisible = false
}

const isInsideOurUI = (node: Node | null): boolean => {
  let el: Node | null = node
  while (el) {
    if (el instanceof Element) {
      if (el.hasAttribute(ROW_ATTR)) return true
      if (el.hasAttribute("data-focusquote-toast")) return true
    }
    el = el.parentNode
  }
  return false
}

const checkSelection = () => {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    hideRow()
    return
  }
  const text = sel.toString().trim()
  if (text.length === 0) {
    hideRow()
    return
  }
  const range = sel.getRangeAt(0)
  if (isInsideOurUI(range.commonAncestorContainer)) return

  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    hideRow()
    return
  }
  showRow(text, rect)
}

function handleSaveClick() {
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
  hideRow()
  // collapse the selection after saving so the row doesn't reappear
  window.getSelection()?.removeAllRanges()
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string }
  matches?: ReadonlyArray<{ translation?: string }>
}

const fetchTranslation = async (
  text: string,
  from: string,
  to: string,
  signal: AbortSignal,
): Promise<string> => {
  const url = new URL("https://api.mymemory.translated.net/get")
  url.searchParams.set("q", text)
  url.searchParams.set("langpair", `${from}|${to}`)
  const res = await fetch(url.toString(), { signal })
  if (!res.ok) throw new Error(`MyMemory ${res.status}`)
  const data = (await res.json()) as MyMemoryResponse
  const translated = data?.responseData?.translatedText
  if (typeof translated === "string" && translated.length > 0) return translated
  const fallback = data?.matches?.[0]?.translation
  if (typeof fallback === "string" && fallback.length > 0) return fallback
  throw new Error("Empty translation")
}

function handleTranslateClick() {
  if (!saveRow) return
  const row = saveRow
  const text = pendingText.slice(0, MYMEMORY_LIMIT)
  if (!text) return

  const from = row.fromSelect.value || "auto"
  const to = row.toSelect.value || "en"
  if (from !== "auto" && from === to) {
    row.resultCard.style.display = "block"
    row.resultCard.style.color = "#bcbcbc"
    row.resultCard.textContent = "Source and target languages match."
    return
  }

  row.resultCard.style.display = "block"
  row.resultCard.style.color = "#bcbcbc"
  row.resultCard.textContent = "Translating…"
  // Re-anchor since the result card grew the row's height.
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    requestAnimationFrame(() =>
      positionRow(row, sel.getRangeAt(0).getBoundingClientRect()),
    )
  }

  currentTranslateAbort?.abort()
  currentTranslateAbort = new AbortController()
  fetchTranslation(text, from, to, currentTranslateAbort.signal)
    .then((out) => {
      row.resultCard.style.color = "#eaeaea"
      row.resultCard.textContent = out
      if (sel && sel.rangeCount > 0) {
        requestAnimationFrame(() =>
          positionRow(row, sel.getRangeAt(0).getBoundingClientRect()),
        )
      }
    })
    .catch((err) => {
      if ((err as Error).name === "AbortError") return
      row.resultCard.style.color = "#ff8b9b"
      row.resultCard.textContent = `Translation failed: ${
        err instanceof Error ? err.message : "unknown"
      }`
    })
}

// ---- listeners ----
//
// Strategy: SHOW only on mouseup / keyup (selection finalized).
// USE selectionchange only to HIDE when the selection collapses,
// so we don't fight the user mid-drag.

const onMouseUp = (e: MouseEvent) => {
  if (saveRow && saveRow.root.contains(e.target as Node)) return
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
    hideRow()
  }
}

const onMouseDown = (e: MouseEvent) => {
  if (saveRow && saveRow.root.contains(e.target as Node)) return
  hideRow()
}

document.addEventListener("mouseup", onMouseUp)
document.addEventListener("keyup", onKeyUp)
document.addEventListener("selectionchange", onSelectionChange)
document.addEventListener("mousedown", onMouseDown, true)
// capture so we react even when an inner scrollable element scrolls
window.addEventListener("scroll", hideRow, { passive: true, capture: true })
window.addEventListener("resize", hideRow, { passive: true })
window.addEventListener("blur", hideRow)

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
