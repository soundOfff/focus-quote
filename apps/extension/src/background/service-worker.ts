import { Effect, Layer } from "effect"
import { StorageService } from "../services/storage"
import { ApiService } from "../services/api"
import { SyncService } from "../services/sync"
import { QuotesService } from "../services/quotes"
import { SessionsService } from "../services/sessions"
import { UrlTrackerService } from "../services/urlTracker"
import { RealtimeStreamService } from "../services/realtimeStream"
import {
  isRuntimeMessage,
  type RuntimeMessage,
  type RuntimeResponse,
  type SaveQuoteMessage,
} from "../shared/messages"
import type { SessionId } from "@focus-quote/shared"

const SYNC_ALARM = "focusquote.sync.tick"
const SYNC_PERIOD_MIN = 2
const SESSION_END_ALARM = "focusquote.session.end"
const SESSION_TICK_ALARM = "focusquote.session.tick"
const URL_FLUSH_ALARM = "focusquote.urls.flush"
const URL_FLUSH_PERIOD_MIN = 0.5 // 30s
const CONTEXT_MENU_ID = "focusquote.saveQuote"

const ServicesLayer = Layer.mergeAll(
  StorageService.Default,
  ApiService.Default,
  SyncService.Default,
  QuotesService.Default,
  SessionsService.Default,
  UrlTrackerService.Default,
  RealtimeStreamService.Default,
)

type AllServices =
  | StorageService
  | ApiService
  | SyncService
  | QuotesService
  | SessionsService
  | UrlTrackerService
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
    updateBadge(active.durationMinutes)

    // Open real-time event channel for AI nudges. Best-effort; tracker
    // still records URLs even if stream fails.
    const stream = yield* RealtimeStreamService
    yield* stream.open(session.id).pipe(Effect.catchAll(() => Effect.void))
  })

const handleSessionCancel = Effect.gen(function* () {
  const sessions = yield* SessionsService
  const tracker = yield* UrlTrackerService
  const stream = yield* RealtimeStreamService
  yield* sessions.cancel
  yield* tracker.flush.pipe(Effect.catchAll(() => Effect.void))
  yield* stream.closeAll
  yield* Effect.promise(() => chrome.alarms.clear(SESSION_END_ALARM))
  yield* Effect.promise(() => chrome.alarms.clear(SESSION_TICK_ALARM))
  yield* Effect.promise(() => chrome.alarms.clear(URL_FLUSH_ALARM))
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
  yield* sessions.complete(active.sessionId as SessionId, true)
  yield* tracker.flush.pipe(Effect.catchAll(() => Effect.void))
  yield* stream.closeAll
  yield* Effect.promise(() => chrome.alarms.clear(SESSION_TICK_ALARM))
  yield* Effect.promise(() => chrome.alarms.clear(URL_FLUSH_ALARM))
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
const handleNavigation = (
  details: chrome.webNavigation.WebNavigationFramedCallbackDetails,
) =>
  Effect.gen(function* () {
    if (details.frameId !== 0) return
    if (!/^https?:/i.test(details.url)) return

    const sessions = yield* SessionsService
    const active = yield* sessions.getActive.pipe(
      Effect.orElseSucceed(() => null),
    )
    if (!active) return

    let hostname: string
    try {
      hostname = new URL(details.url).hostname
    } catch {
      return
    }

    const title = yield* Effect.tryPromise({
      try: () => chrome.tabs.get(details.tabId),
      catch: () => null,
    }).pipe(
      Effect.map((tab) => tab?.title ?? null),
      Effect.catchAll(() => Effect.succeed<string | null>(null)),
    )

    const tracker = yield* UrlTrackerService
    yield* tracker.record({
      sessionId: active.sessionId,
      url: details.url,
      hostname,
      title,
    })
  })

const flushUrls = Effect.gen(function* () {
  const tracker = yield* UrlTrackerService
  yield* tracker.flush.pipe(Effect.catchAll(() => Effect.void))
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
})

// webNavigation must be registered at the top level so it fires after the
// service worker wakes from idle.
chrome.webNavigation.onCompleted.addListener((details) => {
  runWithServices(handleNavigation(details)).catch((err) =>
    console.warn("[FocusQuote] nav handle failed:", err),
  )
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return
  runWithServices(handleSaveSelection(info, tab)).catch((err) =>
    console.error("[FocusQuote] save selection failed:", err),
  )
})

chrome.runtime.onMessage.addListener(
  (msg: unknown, sender, respond: (r: RuntimeResponse) => void) => {
    if (!isRuntimeMessage(msg)) return false
    const program =
      msg.type === "focusquote.session.start"
        ? handleSessionStart(msg)
        : msg.type === "focusquote.session.cancel"
          ? handleSessionCancel
          : msg.type === "focusquote.saveQuote"
            ? handleSaveQuoteMessage(msg, sender)
            : tickSync
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
