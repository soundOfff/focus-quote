import { Effect, Layer } from "effect"
import { StorageService } from "../services/storage"
import { ApiService } from "../services/api"
import { SyncService } from "../services/sync"
import { QuotesService } from "../services/quotes"
import { SessionsService } from "../services/sessions"
import { UrlTrackerService } from "../services/urlTracker"
import { ActionLoggerService } from "../services/actionLogger"
import { RealtimeStreamService } from "../services/realtimeStream"
import {
  isActionEventMessage,
  isApiProxyMessage,
  isCaptureVisibleTabMessage,
  isRuntimeMessage,
  isSpaNavMessage,
  type ApiProxyResponse,
  type ActionEventMessage,
  type CaptureVisibleTabMessage,
  type CaptureVisibleTabResponse,
  type RuntimeMessage,
  type RuntimeResponse,
  type SaveQuoteMessage,
  type SpaNavMessage,
} from "../shared/messages"
import { AUTH_TOKEN_KEY } from "../shared/auth-storage"
import type { SessionId } from "@focus-quote/shared"
import { emitDebug } from "../shared/debug"

const SYNC_ALARM = "focusquote.sync.tick"
const SYNC_PERIOD_MIN = 2
const SESSION_END_ALARM = "focusquote.session.end"
const SESSION_TICK_ALARM = "focusquote.session.tick"
const URL_FLUSH_ALARM = "focusquote.urls.flush"
const ACTION_FLUSH_ALARM = "focusquote.actions.flush"
const URL_FLUSH_PERIOD_MIN = 0.5 // 30s
const CONTEXT_MENU_ID = "focusquote.saveQuote"

const ServicesLayer = Layer.mergeAll(
  StorageService.Default,
  ApiService.Default,
  SyncService.Default,
  QuotesService.Default,
  SessionsService.Default,
  UrlTrackerService.Default,
  ActionLoggerService.Default,
  RealtimeStreamService.Default,
)

type AllServices =
  | StorageService
  | ApiService
  | SyncService
  | QuotesService
  | SessionsService
  | UrlTrackerService
  | ActionLoggerService
  | RealtimeStreamService

const runWithServices = <A, E>(eff: Effect.Effect<A, E, AllServices>) =>
  Effect.runPromise(eff.pipe(Effect.provide(ServicesLayer)))

// ---- badge ----
const updateBadge = (minutesRemaining: number) => {
  if (minutesRemaining <= 0) {
    chrome.action.setBadgeText({ text: "" })
    return
  }
  chrome.action.setBadgeText({ text: String(minutesRemaining) })
  chrome.action.setBadgeBackgroundColor({ color: "#e94560" })
}

const tickSync = Effect.gen(function* () {
  const sync = yield* SyncService
  const result = yield* sync.drain.pipe(
    Effect.catchAll((err) =>
      Effect.sync(() => {
        console.warn("[FocusQuote] drain error:", err)
        return { applied: 0, failed: 0 }
      }),
    ),
  )
  if (result.applied > 0 || result.failed > 0) {
    console.log("[FocusQuote] sync drain", result)
  }
})

// ---- session ----
const tickSessionBadge = Effect.gen(function* () {
  const sessions = yield* SessionsService
  const active = yield* sessions.getActive.pipe(
    Effect.orElseSucceed(() => null),
  )
  if (!active) {
    updateBadge(0)
    return
  }
  const remainingMs = new Date(active.expectedEndAt).getTime() - Date.now()
  const remainingMin = Math.max(0, Math.ceil(remainingMs / 60_000))
  updateBadge(remainingMin)
})

const handleSessionStart = (msg: RuntimeMessage) =>
  Effect.gen(function* () {
    if (msg.type !== "focusquote.session.start") return
    const sessions = yield* SessionsService
    const { session, active } = yield* sessions.start({
      goal: msg.goal,
      durationMinutes: msg.durationMinutes,
      breakMinutes: msg.breakMinutes,
    })
    chrome.alarms.create(SESSION_END_ALARM, {
      when: new Date(active.expectedEndAt).getTime(),
    })
    chrome.alarms.create(SESSION_TICK_ALARM, { periodInMinutes: 1 })
    chrome.alarms.create(URL_FLUSH_ALARM, {
      periodInMinutes: URL_FLUSH_PERIOD_MIN,
    })
    chrome.alarms.create(ACTION_FLUSH_ALARM, {
      periodInMinutes: URL_FLUSH_PERIOD_MIN,
    })
    updateBadge(active.durationMinutes)

    void emitDebug({
      type: "session:start",
      sessionId: active.sessionId,
      goal: active.goal,
    })

    // Push the session row to the server NOW so subsequent URL flushes
    // (which fire every 30s) don't 404 with "Session not found". Without
    // this, URLs would bounce through the sync queue until the next
    // SYNC_ALARM tick — up to 2 minutes of lost-looking state.
    const syncSvc = yield* SyncService
    yield* syncSvc.drain.pipe(Effect.either)

    // Open real-time event channel for AI nudges. Best-effort; tracker
    // still records URLs even if stream fails.
    const stream = yield* RealtimeStreamService
    yield* stream.open(session.id).pipe(Effect.catchAll(() => Effect.void))
  })

const handleSessionCancel = Effect.gen(function* () {
  const sessions = yield* SessionsService
  const tracker = yield* UrlTrackerService
  const stream = yield* RealtimeStreamService
  const syncSvc = yield* SyncService
  yield* sessions.cancel
  yield* syncSvc.drain.pipe(Effect.either)
  yield* tracker.flush.pipe(Effect.catchAll(() => Effect.void))
  yield* stream.closeAll
  yield* Effect.promise(() => chrome.alarms.clear(SESSION_END_ALARM))
  yield* Effect.promise(() => chrome.alarms.clear(SESSION_TICK_ALARM))
  yield* Effect.promise(() => chrome.alarms.clear(URL_FLUSH_ALARM))
  yield* Effect.promise(() => chrome.alarms.clear(ACTION_FLUSH_ALARM))
  updateBadge(0)
})

const handleSessionEnd = Effect.gen(function* () {
  const sessions = yield* SessionsService
  const tracker = yield* UrlTrackerService
  const stream = yield* RealtimeStreamService
  const active = yield* sessions.getActive.pipe(
    Effect.orElseSucceed(() => null),
  )
  if (!active) return
  void emitDebug({ type: "session:end", sessionId: active.sessionId })
  yield* sessions.complete(active.sessionId as SessionId, true)
  // Push session row(s) to the server before the final URL flush so the
  // POST won't 404 on a session that only exists locally.
  const syncSvc = yield* SyncService
  yield* syncSvc.drain.pipe(Effect.either)
  yield* tracker.flush.pipe(Effect.catchAll(() => Effect.void))
  yield* stream.closeAll
  yield* Effect.promise(() => chrome.alarms.clear(SESSION_TICK_ALARM))
  yield* Effect.promise(() => chrome.alarms.clear(URL_FLUSH_ALARM))
  yield* Effect.promise(() => chrome.alarms.clear(ACTION_FLUSH_ALARM))
  updateBadge(0)
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("assets/icons/icon-128.png"),
    title: "FocusQuote",
    message: active.goal
      ? `Session done: ${active.goal}`
      : "Focus session complete",
    priority: 1,
  })
})

// ---- URL tracking ----
const handleNavigation = (details: {
  frameId: number
  tabId: number
  url: string
  title?: string | null
  content?: string | null
}) =>
  Effect.gen(function* () {
    if (details.frameId !== 0) {
      void emitDebug({
        type: "nav:skip-frame",
        frameId: details.frameId,
        url: details.url,
      })
      return
    }
    if (!/^https?:/i.test(details.url)) {
      void emitDebug({ type: "nav:skip-protocol", url: details.url })
      return
    }
    void emitDebug({ type: "nav:received", url: details.url })

    const sessions = yield* SessionsService
    const active = yield* sessions.getActive.pipe(
      Effect.orElseSucceed(() => null),
    )
    if (!active) {
      void emitDebug({ type: "nav:skip-no-session", url: details.url })
      return
    }

    let hostname: string
    try {
      hostname = new URL(details.url).hostname
    } catch {
      void emitDebug({ type: "nav:skip-invalid-url", url: details.url })
      return
    }

    const title =
      details.title ??
      (yield* Effect.tryPromise({
        try: () => chrome.tabs.get(details.tabId),
        catch: () => null,
      }).pipe(
        Effect.map((tab) => tab?.title ?? null),
        Effect.catchAll(() => Effect.succeed<string | null>(null)),
      ))

    const tracker = yield* UrlTrackerService
    yield* tracker.record({
      sessionId: active.sessionId,
      url: details.url,
      hostname,
      title,
      content: details.content ?? null,
    })
  })

const flushUrls = Effect.gen(function* () {
  const tracker = yield* UrlTrackerService
  yield* tracker.flush.pipe(Effect.catchAll(() => Effect.void))
})

const flushActions = Effect.gen(function* () {
  const logger = yield* ActionLoggerService
  yield* logger.flush.pipe(Effect.catchAll(() => Effect.void))
})

const handleSyncNow = Effect.gen(function* () {
  // Force-persist live URL/action buffers first, then drain offline queue.
  yield* flushUrls
  yield* flushActions
  yield* tickSync
})

const handleActionEvent = (msg: ActionEventMessage) =>
  Effect.gen(function* () {
    const logger = yield* ActionLoggerService
    yield* logger.record({
      sessionId: msg.sessionId,
      actionKind: msg.actionKind,
      payload: msg.payload,
      at: msg.at,
    })
  })

const handleSpaNav = (msg: SpaNavMessage, sender: chrome.runtime.MessageSender) =>
  Effect.gen(function* () {
    const details = {
      frameId: 0,
      tabId: sender.tab?.id ?? -1,
      url: msg.url,
      title: msg.title,
      content: msg.content,
    }
    yield* handleNavigation(details)
    const sessions = yield* SessionsService
    const active = yield* sessions.getActive.pipe(Effect.orElseSucceed(() => null))
    if (!active) return
    const logger = yield* ActionLoggerService
    yield* logger.record({
      sessionId: active.sessionId,
      actionKind: "nav",
      payload: JSON.stringify({
        url: msg.url,
        title: msg.title,
      }).slice(0, 4000),
      at: new Date().toISOString(),
    })
  })

// ---- context menu ----
const sendToast = (
  tabId: number,
  message: string,
  variant: "info" | "error" = "info",
) =>
  Effect.tryPromise({
    try: () =>
      chrome.tabs.sendMessage(tabId, {
        type: "focusquote.toast",
        message,
        variant,
      }),
    catch: () => null,
  }).pipe(Effect.either, Effect.asVoid)

const saveAndNotify = (
  text: string,
  sourceUrl: string | null,
  sourceTitle: string | null,
  tag: string | null,
  tabId: number | undefined,
) =>
  Effect.gen(function* () {
    if (!text.trim()) return
    const quotes = yield* QuotesService
    yield* quotes.save({ text, sourceUrl, sourceTitle, tag })
    if (tabId !== undefined) {
      yield* sendToast(tabId, "Quote saved")
    }
    yield* (yield* SyncService).drain.pipe(Effect.either)
  })

const handleSaveSelection = (
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
) =>
  saveAndNotify(
    info.selectionText ?? "",
    tab?.url ?? null,
    tab?.title ?? null,
    null,
    tab?.id,
  )

const handleSaveQuoteMessage = (
  msg: SaveQuoteMessage,
  sender: chrome.runtime.MessageSender,
) =>
  saveAndNotify(
    msg.text,
    msg.sourceUrl,
    msg.sourceTitle,
    msg.tag,
    sender.tab?.id,
  )

const registerContextMenu = () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "Save to FocusQuote",
      contexts: ["selection"],
    })
  })
}

// ---- listeners ----
chrome.runtime.onInstalled.addListener(() => {
  registerContextMenu()
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MIN })
})

chrome.runtime.onStartup.addListener(() => {
  registerContextMenu()
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MIN })
  runWithServices(tickSync).catch((err) =>
    console.warn("[FocusQuote] startup sync failed:", err),
  )
  runWithServices(tickSessionBadge).catch(() => {})
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) {
    runWithServices(tickSync).catch((err) =>
      console.warn("[FocusQuote] alarm sync failed:", err),
    )
    return
  }
  if (alarm.name === SESSION_TICK_ALARM) {
    runWithServices(tickSessionBadge).catch(() => {})
    return
  }
  if (alarm.name === SESSION_END_ALARM) {
    runWithServices(handleSessionEnd).catch((err) =>
      console.error("[FocusQuote] session end failed:", err),
    )
    return
  }
  if (alarm.name === URL_FLUSH_ALARM) {
    runWithServices(flushUrls).catch((err) =>
      console.warn("[FocusQuote] url flush failed:", err),
    )
    return
  }
  if (alarm.name === ACTION_FLUSH_ALARM) {
    runWithServices(flushActions).catch((err) =>
      console.warn("[FocusQuote] action flush failed:", err),
    )
    return
  }
})

// webNavigation must be registered at the top level so it fires after the
// service worker wakes from idle.
chrome.webNavigation.onCompleted.addListener((details) => {
  runWithServices(handleNavigation(details)).catch((err) =>
    console.warn("[FocusQuote] nav handle failed:", err),
  )
})
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  runWithServices(handleNavigation(details)).catch((err) =>
    console.warn("[FocusQuote] history nav handle failed:", err),
  )
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return
  runWithServices(handleSaveSelection(info, tab)).catch((err) =>
    console.error("[FocusQuote] save selection failed:", err),
  )
})

/**
 * Toolbar AI proxy. Content scripts can't reach our server directly because
 * their `fetch` runs in the page origin, which the server's CORS doesn't
 * trust. The SW has the extension origin, so we forward the request here.
 */
const API_BASE = __API_BASE_URL__.replace(/\/+$/, "")

const handleApiProxy = async (
  msg: { path: string; method: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown },
): Promise<ApiProxyResponse> => {
  try {
    const stored = await chrome.storage.local.get(AUTH_TOKEN_KEY)
    const token = stored?.[AUTH_TOKEN_KEY]
    if (typeof token !== "string" || token.length === 0) {
      return {
        ok: false,
        status: 401,
        error:
          "Sign in to FocusQuote (open the extension popup) to use AI features.",
      }
    }
    const res = await fetch(`${API_BASE}${msg.path}`, {
      method: msg.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: msg.body !== undefined ? JSON.stringify(msg.body) : undefined,
    })
    const contentType = res.headers.get("content-type") ?? ""
    let data: unknown = null
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => null)
    }
    if (!res.ok) {
      const text =
        typeof data === "object" && data !== null && "error" in data
          ? String((data as { error?: unknown }).error)
          : await res.text().catch(() => "")
      return {
        ok: false,
        status: res.status,
        error: text || `HTTP ${res.status}`,
      }
    }
    return { ok: true, status: res.status, data }
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

chrome.runtime.onMessage.addListener(
  (msg: unknown, _sender, respond: (r: ApiProxyResponse) => void) => {
    if (!isApiProxyMessage(msg)) return false
    handleApiProxy(msg).then(respond)
    return true
  },
)

/**
 * Viewport-only screenshot. Forwards to `chrome.tabs.captureVisibleTab` —
 * we use the sender tab's window so multi-window setups capture the right
 * surface (falls back to the current window when sender info is missing).
 */
const handleCaptureVisibleTab = async (
  msg: CaptureVisibleTabMessage,
  sender: chrome.runtime.MessageSender,
): Promise<CaptureVisibleTabResponse> => {
  try {
    const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: msg.format ?? "png",
      ...(msg.quality !== undefined ? { quality: msg.quality } : {}),
    })
    return { ok: true, dataUrl }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

chrome.runtime.onMessage.addListener(
  (msg: unknown, sender, respond: (r: CaptureVisibleTabResponse) => void) => {
    if (!isCaptureVisibleTabMessage(msg)) return false
    handleCaptureVisibleTab(msg, sender).then(respond)
    return true
  },
)

chrome.runtime.onMessage.addListener(
  (msg: unknown, sender, respond: (r: RuntimeResponse) => void) => {
    if (isSpaNavMessage(msg)) {
      runWithServices(handleSpaNav(msg, sender))
        .then(() => respond({ ok: true }))
        .catch((err) =>
          respond({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      return true
    }
    if (isActionEventMessage(msg)) {
      runWithServices(handleActionEvent(msg))
        .then(() => respond({ ok: true }))
        .catch((err) =>
          respond({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      return true
    }
    if (!isRuntimeMessage(msg)) return false
    const program =
      msg.type === "focusquote.session.start"
        ? handleSessionStart(msg)
        : msg.type === "focusquote.session.cancel"
          ? handleSessionCancel
          : msg.type === "focusquote.saveQuote"
            ? handleSaveQuoteMessage(msg, sender)
            : handleSyncNow
    runWithServices(program)
      .then(() => respond({ ok: true }))
      .catch((err) =>
        respond({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    return true
  },
)
