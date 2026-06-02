import {
  DEBUG_OVERLAY_KEY,
  isDebugEnvelope,
  type DebugEvent,
  type DebugEnvelope,
} from "../shared/debug"
import { initFocusToolbar } from "./toolbar"
import { mountActionCapture } from "./actionCapture"
import { extractPageContent } from "./pageContent"
import { isAnyToolActive, subscribeToolState } from "./toolbar/tool-state"
import { PREFS_KEY, defaultPrefs } from "../shared/prefs"
import {
  isValidTranslateFrom,
  isValidTranslateTo,
} from "../shared/translation"
import { injectHostScrollbarStyles } from "./inject-scrollbar"
import { injectHostFonts } from "./inject-fonts"
import { createSelectionBar, type SelectionBar } from "./toolbar/selection-bar"

// Themed scrollbars for in-page UI (save row, Quote+AI, debug panel, etc.)
injectHostScrollbarStyles()

// Geist + JetBrains Mono for the Direction A selection toolbar.
injectHostFonts()

// Floating focus-mode toolbar (only renders while a session is active).
initFocusToolbar()

const SESSION_KEY = "focusquote.activeSession"
const PRIVACY_KEY = "focusquote.privacy"

type ActiveSession = { sessionId: string } | null
type Privacy = { trackUrls: boolean; blocklist: string[] }
type Prefs = {
  translateFromLang: string
  translateToLang: string
}
let activeSession: ActiveSession = null
let privacy: Privacy = { trackUrls: false, blocklist: [] }
let prefs: Prefs = {
  translateFromLang: defaultPrefs.translateFromLang,
  translateToLang: defaultPrefs.translateToLang,
}
let selectionBar: SelectionBar | null = null

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
  const out = await chrome.storage.local.get([SESSION_KEY, PRIVACY_KEY, PREFS_KEY])
  activeSession = (out[SESSION_KEY] as ActiveSession) ?? null
  const nextPrivacy = out[PRIVACY_KEY]
  const nextPrefs = out[PREFS_KEY]
  if (
    nextPrivacy &&
    typeof nextPrivacy === "object" &&
    "trackUrls" in nextPrivacy &&
    "blocklist" in nextPrivacy
  ) {
    privacy = nextPrivacy as Privacy
  }
  if (nextPrefs && typeof nextPrefs === "object") {
    const p = nextPrefs as Record<string, unknown>
    const from =
      typeof p.translateFromLang === "string" && p.translateFromLang.length > 0
        ? p.translateFromLang
        : defaultPrefs.translateFromLang
    const to =
      typeof p.translateToLang === "string" && p.translateToLang.length > 0
        ? p.translateToLang
        : defaultPrefs.translateToLang
    prefs = {
      translateFromLang: isValidTranslateFrom(from)
        ? from
        : defaultPrefs.translateFromLang,
      translateToLang: isValidTranslateTo(to) ? to : defaultPrefs.translateToLang,
    }
  }
  if (selectionBar) {
    selectionBar.setFromLang(prefs.translateFromLang)
    selectionBar.setToLang(prefs.translateToLang)
  }
}

const SPA_NAV_INJECTOR_PATH = "src/content/spaNavInjector.js"

const injectSpaNavScript = () => {
  const id = "focusquote-spa-nav-injector"
  if (document.getElementById(id)) return
  const parent = document.documentElement || document.head || document.body
  if (!parent) return
  const script = document.createElement("script")
  script.id = id
  script.src = chrome.runtime.getURL(SPA_NAV_INJECTOR_PATH)
  script.async = false
  script.onload = () => script.remove()
  script.onerror = () => {
    script.remove()
    console.warn("[FocusQuote] failed to inject SPA nav bridge")
  }
  parent.appendChild(script)
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
// Watch the three local keys this content script cares about. Any other
// chrome.storage.local key change (e.g. focusquote.openrouter-key) must NOT
// re-run refreshSessionAndPrivacy — it does session-boundary detection that
// could surprise the toolbar chat if triggered for unrelated reasons.
const WATCHED_LOCAL_KEYS = new Set<string>([SESSION_KEY, PRIVACY_KEY, PREFS_KEY])
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  let relevant = false
  for (const key of Object.keys(changes)) {
    if (WATCHED_LOCAL_KEYS.has(key)) {
      relevant = true
      break
    }
  }
  if (!relevant) return
  void refreshSessionAndPrivacy()
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
  const bg =
    variant === "error" ? "rgb(255 233 230)" : "rgb(255 255 255)"
  const border =
    variant === "error" ? "rgb(205 66 57)" : "rgb(191 193 183)"
  const el = document.createElement("div")
  el.textContent = text
  el.setAttribute("data-focusquote-toast", "")
  el.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:2147483647",
    `background:${bg}`,
    `border:1px solid ${border}`,
    "color:rgb(35 37 29)",
    "padding:10px 16px",
    "border-radius:8px",
    "font:14px system-ui,-apple-system,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,.10)",
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

// ---------------- Selection toolbar (Direction A) ----------------

const readLegacyTranslatePref = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

const persistTranslatePrefs = (nextFrom: string, nextTo: string): void => {
  prefs = { translateFromLang: nextFrom, translateToLang: nextTo }
  void chrome.storage.local
    .get(PREFS_KEY)
    .then((out) => {
      const current =
        out[PREFS_KEY] && typeof out[PREFS_KEY] === "object"
          ? (out[PREFS_KEY] as Record<string, unknown>)
          : {}
      return chrome.storage.local.set({
        [PREFS_KEY]: {
          ...current,
          translateFromLang: nextFrom,
          translateToLang: nextTo,
        },
      })
    })
    .catch(() => {})
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string }
  responseStatus?: number | string
  responseDetails?: string
  matches?: ReadonlyArray<{ translation?: string }>
}

class TranslateQuotaError extends Error {
  constructor() {
    super("translate_quota_exhausted")
    this.name = "TranslateQuotaError"
  }
}

const isQuotaResponse = (data: MyMemoryResponse): boolean => {
  const status = data?.responseStatus
  const details = (data?.responseDetails ?? "").toUpperCase()
  if (status === 429 || status === "429") return true
  return (
    details.includes("MYMEMORY WARNING") &&
    (details.includes("FREE TRANSLATIONS") || details.includes("DAILY"))
  )
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
  if (res.status === 429) throw new TranslateQuotaError()
  if (!res.ok) throw new Error(`MyMemory ${res.status}`)
  const data = (await res.json()) as MyMemoryResponse
  if (isQuotaResponse(data)) throw new TranslateQuotaError()
  const translated = data?.responseData?.translatedText
  if (typeof translated === "string" && translated.length > 0) {
    if (translated.toUpperCase().includes("MYMEMORY WARNING")) {
      throw new TranslateQuotaError()
    }
    return translated
  }
  const fallback = data?.matches?.[0]?.translation
  if (typeof fallback === "string" && fallback.length > 0) return fallback
  throw new Error("Empty translation")
}

const resolveInitialLangs = (): { from: string; to: string } => {
  const from = isValidTranslateFrom(prefs.translateFromLang)
    ? prefs.translateFromLang
    : isValidTranslateFrom(
          readLegacyTranslatePref("focusquote.translate.from", defaultPrefs.translateFromLang),
        )
      ? readLegacyTranslatePref("focusquote.translate.from", defaultPrefs.translateFromLang)
      : "auto"
  const to = isValidTranslateTo(prefs.translateToLang)
    ? prefs.translateToLang
    : isValidTranslateTo(
          readLegacyTranslatePref("focusquote.translate.to", defaultPrefs.translateToLang),
        )
      ? readLegacyTranslatePref("focusquote.translate.to", defaultPrefs.translateToLang)
      : "en"
  return { from, to }
}

const ensureBar = (): SelectionBar => {
  if (selectionBar && selectionBar.root.isConnected) return selectionBar
  const initial = resolveInitialLangs()
  selectionBar = createSelectionBar({
    onSave: (text) => {
      const payload = {
        type: "focusquote.saveQuote" as const,
        text,
        sourceUrl: location.href,
        sourceTitle: document.title || null,
      }
      chrome.runtime.sendMessage(payload).catch(() => {
        showToast("Couldn't save — extension reloaded?", "error")
        selectionBar?.hide()
      })
    },
    onTranslate: fetchTranslation,
    onLanguageChange: persistTranslatePrefs,
    initialFromLang: initial.from,
    initialToLang: initial.to,
  })
  ;(document.documentElement || document.body).appendChild(selectionBar.root)
  void selectionBar.root.offsetWidth
  return selectionBar
}

const hideBar = () => {
  if (!selectionBar || !selectionBar.isVisible()) return
  selectionBar.hide()
}

const isInsideOurUI = (node: Node | null): boolean => {
  let el: Node | null = node
  while (el) {
    if (el instanceof Element) {
      if (el.hasAttribute("data-focusquote-selection-bar")) return true
      if (el.hasAttribute("data-focusquote-lang-dropdown")) return true
      if (el.hasAttribute("data-focusquote-toast")) return true
    }
    el = el.parentNode
  }
  return false
}

const checkSelection = () => {
  if (isAnyToolActive()) {
    hideBar()
    return
  }
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    hideBar()
    return
  }
  const text = sel.toString().trim()
  if (text.length === 0) {
    hideBar()
    return
  }
  const range = sel.getRangeAt(0)
  if (isInsideOurUI(range.commonAncestorContainer)) return

  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    hideBar()
    return
  }
  const bar = ensureBar()
  bar.show(text, rect)
}

// A shown translation result stays pinned through transient page events
// (scroll, focus loss, ambient selection collapse). It is dismissed only by an
// explicit outside click or by starting a brand-new selection.
const isResultPinned = (): boolean =>
  !!selectionBar && selectionBar.isVisible() && selectionBar.isResultOpen()

const onMouseUp = (e: MouseEvent) => {
  // The language dropdown owns the interaction while open; focusing its filter
  // input collapses the page selection, so don't re-run checkSelection here.
  if (selectionBar?.isDropdownOpen()) return
  if (selectionBar && selectionBar.root.contains(e.target as Node)) return
  setTimeout(checkSelection, 0)
}

const onKeyUp = (e: KeyboardEvent) => {
  if (selectionBar?.isDropdownOpen()) return
  if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
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
  // Keep the bar alive while the dropdown owns the interaction (its filter
  // input collapses the page selection) or while a translation result is shown.
  if (selectionBar?.isDropdownOpen()) return
  if (isResultPinned()) return
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    hideBar()
  }
}

const onMouseDown = (e: MouseEvent) => {
  if (selectionBar && selectionBar.root.contains(e.target as Node)) return
  if (isInsideOurUI(e.target as Node)) return
  hideBar()
}

document.addEventListener("mouseup", onMouseUp)
document.addEventListener("keyup", onKeyUp)
document.addEventListener("selectionchange", onSelectionChange)
document.addEventListener("mousedown", onMouseDown, true)

const onScrollOrResize = () => {
  if (selectionBar?.isDropdownOpen()) return
  // Keep a shown translation result readable on scroll/resize (the bar is
  // position:fixed, so it stays put) instead of dismissing it.
  if (isResultPinned()) return
  hideBar()
}

const onWindowBlur = () => {
  if (selectionBar?.isDropdownOpen()) return
  if (isResultPinned()) return
  hideBar()
}

window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true })
window.addEventListener("resize", onScrollOrResize, { passive: true })
window.addEventListener("blur", onWindowBlur)

subscribeToolState((active) => {
  if (active) hideBar()
  else setTimeout(checkSelection, 0)
})

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
  list.setAttribute("data-fq-scrollbar", "")
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

// Debug overlay only cares about its own toggle + the active session.
const DEBUG_WATCHED_KEYS = new Set<string>([DEBUG_OVERLAY_KEY, SESSION_KEY])
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  let relevant = false
  for (const key of Object.keys(changes)) {
    if (DEBUG_WATCHED_KEYS.has(key)) {
      relevant = true
      break
    }
  }
  if (!relevant) return
  refreshDebugVisibility().catch(() => {})
})

refreshDebugVisibility().catch(() => {})
