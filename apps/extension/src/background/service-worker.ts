import { Effect, Layer } from "effect"
import { DatabaseService } from "../services/database"
import { StorageService } from "../services/storage"
import { SyncService } from "../services/sync"
import { QuotesService } from "../services/quotes"
import { SessionsService } from "../services/sessions"
import { getOrCreateDeviceId } from "../shared/ids"
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
const CONTEXT_MENU_ID = "focusquote.saveQuote"

const ServicesLayer = Layer.mergeAll(
  StorageService.Default,
  DatabaseService.Default,
  SyncService.Default,
  QuotesService.Default,
  SessionsService.Default,
)

type AllServices =
  | DatabaseService
  | StorageService
  | SyncService
  | QuotesService
  | SessionsService

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

// ---- install / startup ----
const onInstall = Effect.gen(function* () {
  const deviceId = yield* getOrCreateDeviceId
  console.log("[FocusQuote] device id:", deviceId)

  const db = yield* DatabaseService
  if (!db.isReady()) {
    console.warn("[FocusQuote] Turso not configured at build time")
  } else {
    yield* db.ensureSchema
    console.log("[FocusQuote] schema ensured")
  }
})

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
  const active = yield* sessions.getActive.pipe(Effect.orElseSucceed(() => null))
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
    const deviceId = yield* getOrCreateDeviceId
    const sessions = yield* SessionsService
    const { active } = yield* sessions.start(
      {
        goal: msg.goal,
        durationMinutes: msg.durationMinutes,
        breakMinutes: msg.breakMinutes,
      },
      deviceId,
    )
    chrome.alarms.create(SESSION_END_ALARM, {
      when: new Date(active.expectedEndAt).getTime(),
    })
    chrome.alarms.create(SESSION_TICK_ALARM, { periodInMinutes: 1 })
    updateBadge(active.durationMinutes)
  })

const handleSessionCancel = Effect.gen(function* () {
  const sessions = yield* SessionsService
  yield* sessions.cancel
  yield* Effect.promise(() => chrome.alarms.clear(SESSION_END_ALARM))
  yield* Effect.promise(() => chrome.alarms.clear(SESSION_TICK_ALARM))
  updateBadge(0)
})

const handleSessionEnd = Effect.gen(function* () {
  const sessions = yield* SessionsService
  const active = yield* sessions.getActive.pipe(Effect.orElseSucceed(() => null))
  if (!active) return
  yield* sessions.complete(active.sessionId as SessionId, true)
  yield* Effect.promise(() => chrome.alarms.clear(SESSION_TICK_ALARM))
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
    const deviceId = yield* getOrCreateDeviceId
    const quotes = yield* QuotesService
    yield* quotes.save(
      { text, sourceUrl, sourceTitle, tag },
      deviceId,
    )
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
  runWithServices(onInstall).catch((err) =>
    console.error("[FocusQuote] install failed:", err),
  )
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
        respond({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      )
    return true
  },
)
