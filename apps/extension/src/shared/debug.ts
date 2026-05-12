/**
 * Debug overlay: in-page panel that surfaces the tracker pipeline in real
 * time. Toggled in Options ("Debug overlay") and only visible while a focus
 * session is active. The service worker / tracker emit events here; the
 * content script renders them.
 */

export const DEBUG_OVERLAY_KEY = "focusquote.debug.overlayEnabled"

export type DebugEvent =
  | { type: "session:start"; sessionId: string; goal: string | null }
  | { type: "session:end"; sessionId: string }
  | { type: "nav:received"; url: string }
  | { type: "nav:skip-frame"; frameId: number; url: string }
  | { type: "nav:skip-protocol"; url: string }
  | { type: "nav:skip-no-session"; url: string }
  | { type: "nav:skip-invalid-url"; url: string }
  | { type: "buffer:add"; hostname: string; title: string | null; bufferLen: number }
  | { type: "buffer:skip-privacy-off"; hostname: string }
  | { type: "buffer:skip-blocklist"; hostname: string }
  | { type: "buffer:skip-dedupe"; hostname: string }
  | { type: "flush:start"; count: number }
  | { type: "flush:empty" }
  | { type: "flush:posted"; count: number; ms: number }
  | { type: "flush:queued"; count: number; ms: number; reason: string }
  | { type: "error"; where: string; message: string }

export interface DebugEnvelope {
  type: "focusquote.debug.event"
  at: number
  event: DebugEvent
}

const isEnvelope = (x: unknown): x is DebugEnvelope => {
  if (typeof x !== "object" || x === null) return false
  const m = x as Record<string, unknown>
  return (
    m.type === "focusquote.debug.event" &&
    typeof m.at === "number" &&
    typeof m.event === "object" &&
    m.event !== null
  )
}

export { isEnvelope as isDebugEnvelope }

/**
 * Broadcast a debug event to every content-scripted tab. Best-effort:
 * tabs without our content script (chrome://, extension pages, etc.)
 * silently reject sendMessage and we swallow the error.
 */
export const emitDebug = async (event: DebugEvent): Promise<void> => {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return
  const envelope: DebugEnvelope = {
    type: "focusquote.debug.event",
    at: Date.now(),
    event,
  }
  try {
    const tabs = await chrome.tabs.query({})
    for (const t of tabs) {
      if (t.id === undefined) continue
      chrome.tabs.sendMessage(t.id, envelope).catch(() => {
        /* no content script in that tab — ignore */
      })
    }
  } catch {
    /* tabs API unavailable in this context — ignore */
  }
}
