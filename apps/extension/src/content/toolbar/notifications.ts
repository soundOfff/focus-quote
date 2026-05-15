import { icons } from "./icons"
import { tokens } from "./tokens"
import type { ToolbarShell } from "./shell"

/**
 * Notifications toggle. When "blocked", we monkey-patch
 * `Notification.requestPermission` to return `"denied"` and (best-effort)
 * stub the `Notification` constructor so already-granted sites can't fire
 * new notifications while focus mode is on.
 *
 * The override lives in the content-script's isolated world *and* is also
 * mirrored into the page world via an injected script element so that
 * page-world code is intercepted too. State persists in localStorage so the
 * preference survives navigations.
 */

const STORAGE_KEY = "focusquote.toolbar.notificationsBlocked"
const PAGE_MARKER = "data-focusquote-notif-override"
const PAGE_SCRIPT_ID = "focusquote-notifications-page-world"
const PAGE_SCRIPT_PATH = "src/content/notificationsPageWorld.js"
const PAGE_MESSAGE_TYPE = "focusquote.notifications.override"

const readBlocked = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}
const writeBlocked = (b: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, b ? "1" : "0")
  } catch {
    /* private mode etc. */
  }
}

const injectPageBridge = (): void => {
  if (document.getElementById(PAGE_SCRIPT_ID)) return
  try {
    const el = document.createElement("script")
    el.id = PAGE_SCRIPT_ID
    el.setAttribute(PAGE_MARKER, "")
    el.src = chrome.runtime.getURL(PAGE_SCRIPT_PATH)
    el.async = false
    ;(document.documentElement || document.head || document.body).appendChild(
      el,
    )
  } catch (err) {
    console.warn("[FocusQuote] could not inject page-world bridge:", err)
  }
}

const notifyPageWorld = (blocked: boolean): void => {
  window.postMessage(
    {
      source: "focusquote",
      type: PAGE_MESSAGE_TYPE,
      blocked,
    },
    "*",
  )
}

/**
 * Patch the *isolated* world copy of `Notification`. Most pages don't trigger
 * notifications from extension contexts, but content-script code we ship
 * later might, and this keeps the surface tight. We hold the original so we
 * can restore it cleanly on teardown.
 */
const isolatedOrig: {
  requestPermission: typeof Notification.requestPermission | null
} = { requestPermission: null }

const applyIsolatedPatch = (): void => {
  if (typeof Notification === "undefined") return
  if (isolatedOrig.requestPermission !== null) return // already patched
  isolatedOrig.requestPermission = Notification.requestPermission
  try {
    Notification.requestPermission = ((...args: unknown[]) => {
      const cb = args[0]
      if (typeof cb === "function") {
        try {
          ;(cb as (p: NotificationPermission) => void)("denied")
        } catch {
          /* ignore */
        }
      }
      return Promise.resolve("denied")
    }) as typeof Notification.requestPermission
  } catch {
    /* some envs ship a frozen prototype — non-fatal */
  }
}

const removeIsolatedPatch = (): void => {
  if (typeof Notification === "undefined") return
  if (isolatedOrig.requestPermission === null) return
  try {
    Notification.requestPermission = isolatedOrig.requestPermission
  } catch {
    /* ignore */
  }
  isolatedOrig.requestPermission = null
}

export const installNotificationsButton = (shell: ToolbarShell): (() => void) => {
  let blocked = readBlocked()

  const apply = (state: boolean) => {
    blocked = state
    writeBlocked(state)
    if (state) {
      applyIsolatedPatch()
      injectPageBridge()
      notifyPageWorld(true)
      btn.setIcon(icons.bellOff(tokens.icon.md))
      btn.setBadge(true)
      btn.setActive(true)
      btn.setLabel("Notifications blocked — click to allow")
    } else {
      removeIsolatedPatch()
      injectPageBridge()
      notifyPageWorld(false)
      btn.setIcon(icons.bell(tokens.icon.md))
      btn.setBadge(false)
      btn.setActive(false)
      btn.setLabel("Notifications allowed — click to block")
    }
  }

  const btn = shell.addButton({
    id: "notifications",
    label: "Notifications",
    icon: icons.bell(tokens.icon.md),
    onClick: () => apply(!blocked),
  })

  apply(blocked)

  return () => {
    // On teardown (session ended): restore originals everywhere. We don't
    // touch the stored preference — if the user re-starts a session, we
    // want their previous choice to come back.
    removeIsolatedPatch()
    injectPageBridge()
    notifyPageWorld(false)
  }
}
