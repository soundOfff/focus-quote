/**
 * Typed messages exchanged between popup/options/newtab and the service worker
 * via chrome.runtime.sendMessage.
 */

export interface SessionStartMessage {
  type: "focusquote.session.start"
  durationMinutes: number
  breakMinutes: number
  // The session title — required at start (no AI auto-title). Non-empty;
  // stored in the `goal` column for backwards compatibility.
  goal: string
  // The Topic ("vault") the session is filed under, chosen in the popup before
  // the timer runs. The server resolves + ownership-checks it.
  topicId: string
}

export interface SessionCancelMessage {
  type: "focusquote.session.cancel"
}

/**
 * Ends the active session early as *completed* (distinct from cancel, which
 * ends it as not-completed). Runs the same path as a natural timer expiry:
 * marks completed=true, drains to the server, and triggers the completion
 * pipeline. See issue #35.
 */
export interface SessionFinishMessage {
  type: "focusquote.session.finish"
}

export interface SyncNowMessage {
  type: "focusquote.sync.now"
}

export interface SaveQuoteMessage {
  type: "focusquote.saveQuote"
  text: string
  sourceUrl: string | null
  sourceTitle: string | null
}

/**
 * Broadcast from the service worker to popup/newtab when a session-stream
 * event arrives. Receivers must listen with chrome.runtime.onMessage and
 * filter on `type === "focusquote.stream.event"`.
 */
export interface StreamEventBroadcast {
  type: "focusquote.stream.event"
  sessionId: string
  event: import("@focus-quote/shared").SessionStreamEvent
}

/**
 * Lets the in-page toolbar (content script) issue server-bound HTTP calls
 * via the service worker. Content-script fetches use the *page's* origin
 * which our server's CORS won't accept; routing through the SW means the
 * request leaves the browser with the extension's origin (which is in
 * `EXTENSION_ORIGIN`) and the bearer token attached automatically.
 */
export interface ApiProxyMessage {
  type: "focusquote.apiProxy"
  path: string
  method: "GET" | "POST" | "PUT" | "DELETE"
  body?: unknown
}

export type ApiProxyResponse =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number | null; error: string }

/**
 * Asks the service worker to capture the current visible viewport of the
 * active tab. We must do this from the SW because `chrome.tabs.captureVisibleTab`
 * is not exposed to content scripts — it requires extension-context APIs.
 */
export interface CaptureVisibleTabMessage {
  type: "focusquote.captureVisibleTab"
  format?: "png" | "jpeg"
  quality?: number
}

export type CaptureVisibleTabResponse =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string }

export const isCaptureVisibleTabMessage = (
  msg: unknown,
): msg is CaptureVisibleTabMessage => {
  if (typeof msg !== "object" || msg === null) return false
  return (msg as { type?: unknown }).type === "focusquote.captureVisibleTab"
}

export interface SpaNavMessage {
  type: "focusquote.spa-nav"
  url: string
  title: string | null
  content: string | null
}

export const isSpaNavMessage = (msg: unknown): msg is SpaNavMessage => {
  if (typeof msg !== "object" || msg === null) return false
  const m = msg as Record<string, unknown>
  return (
    m.type === "focusquote.spa-nav" &&
    typeof m.url === "string" &&
    (m.title === null || typeof m.title === "string") &&
    (m.content === null || typeof m.content === "string")
  )
}

export interface ActionEventMessage {
  type: "focusquote.action"
  sessionId: string
  actionKind: "click" | "focus" | "blur" | "submit" | "scroll" | "nav"
  payload: string
  at: string
}

export const isActionEventMessage = (msg: unknown): msg is ActionEventMessage => {
  if (typeof msg !== "object" || msg === null) return false
  const m = msg as Record<string, unknown>
  return (
    m.type === "focusquote.action" &&
    typeof m.sessionId === "string" &&
    typeof m.payload === "string" &&
    typeof m.at === "string" &&
    (m.actionKind === "click" ||
      m.actionKind === "focus" ||
      m.actionKind === "blur" ||
      m.actionKind === "submit" ||
      m.actionKind === "scroll" ||
      m.actionKind === "nav")
  )
}

/**
 * Asks the service worker to drain one Conversation turn into the offline sync
 * queue (ai_chat_threads/messages). Sent from the in-page toolbar whenever a
 * turn is appended; the SW derives the deterministic thread id and enqueues the
 * thread upsert + message append. Guests are a noop (drain needs a token).
 */
export interface SyncConversationMessage {
  type: "focusquote.syncConversation"
  url: string
  passage: string
  role: "user" | "assistant"
  content: string
}

export const isSyncConversationMessage = (
  msg: unknown,
): msg is SyncConversationMessage => {
  if (typeof msg !== "object" || msg === null) return false
  const m = msg as Record<string, unknown>
  return (
    m.type === "focusquote.syncConversation" &&
    typeof m.url === "string" &&
    typeof m.passage === "string" &&
    typeof m.content === "string" &&
    (m.role === "user" || m.role === "assistant")
  )
}

/** Opens the extension action popup (user-gesture only; extension pages only). */
export interface OpenPopupMessage {
  type: "focusquote.ui.openPopup"
}

/**
 * Asks the service worker to run the Google (OAuth) sign-in flow. This MUST run
 * in the SW, not the popup: `chrome.identity.launchWebAuthFlow` opens a window
 * that steals focus, and Chrome destroys the popup the moment it loses focus —
 * tearing down the in-flight flow before the token can be persisted. The SW
 * survives, persists the session, and broadcasts `focusquote.auth.signedIn`.
 */
export interface SignInGoogleMessage {
  type: "focusquote.auth.signInGoogle"
}

export type SignInGoogleResponse =
  | { ok: true; user: import("@focus-quote/shared").User }
  | { ok: false; error: string }

export const isSignInGoogleMessage = (
  msg: unknown,
): msg is SignInGoogleMessage => {
  if (typeof msg !== "object" || msg === null) return false
  return (msg as { type?: unknown }).type === "focusquote.auth.signInGoogle"
}

export type RuntimeMessage =
  | SessionStartMessage
  | SessionCancelMessage
  | SessionFinishMessage
  | SyncNowMessage
  | SaveQuoteMessage
  | OpenPopupMessage

export interface OkResponse {
  ok: true
}
export interface ErrorResponse {
  ok: false
  error: string
}
export type RuntimeResponse = OkResponse | ErrorResponse

export const isApiProxyMessage = (msg: unknown): msg is ApiProxyMessage => {
  if (typeof msg !== "object" || msg === null) return false
  const m = msg as Record<string, unknown>
  return (
    m.type === "focusquote.apiProxy" &&
    typeof m.path === "string" &&
    (m.method === "GET" ||
      m.method === "POST" ||
      m.method === "PUT" ||
      m.method === "DELETE")
  )
}

export const isRuntimeMessage = (msg: unknown): msg is RuntimeMessage => {
  if (typeof msg !== "object" || msg === null) return false
  const t = (msg as { type?: unknown }).type
  return (
    t === "focusquote.session.start" ||
    t === "focusquote.session.cancel" ||
    t === "focusquote.session.finish" ||
    t === "focusquote.sync.now" ||
    t === "focusquote.saveQuote" ||
    t === "focusquote.ui.openPopup"
  )
}
