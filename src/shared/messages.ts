/**
 * Typed messages exchanged between popup/options/newtab and the service worker
 * via chrome.runtime.sendMessage.
 */

export interface SessionStartMessage {
  type: "focusquote.session.start"
  durationMinutes: number
  breakMinutes: number
  goal: string | null
}

export interface SessionCancelMessage {
  type: "focusquote.session.cancel"
}

export interface SyncNowMessage {
  type: "focusquote.sync.now"
}

export type RuntimeMessage =
  | SessionStartMessage
  | SessionCancelMessage
  | SyncNowMessage

export interface OkResponse {
  ok: true
}
export interface ErrorResponse {
  ok: false
  error: string
}
export type RuntimeResponse = OkResponse | ErrorResponse

export const isRuntimeMessage = (msg: unknown): msg is RuntimeMessage => {
  if (typeof msg !== "object" || msg === null) return false
  const t = (msg as { type?: unknown }).type
  return (
    t === "focusquote.session.start" ||
    t === "focusquote.session.cancel" ||
    t === "focusquote.sync.now"
  )
}
