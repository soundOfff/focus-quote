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

/**
 * The script we inject into the page world. Stringified so it survives the
 * isolated-world boundary. Stores originals on a hidden global so we can
 * restore them later when the user re-enables notifications.
 */
const PAGE_WORLD_SCRIPT = `
;(() => {
  const FQ_KEY = '__focusquote_notif__';
  const w = window;
  if (w[FQ_KEY] && w[FQ_KEY].applied) return;
  if (typeof w.Notification === 'undefined') return;
  const origRequest = w.Notification.requestPermission;
  const origCtor = w.Notification;
  w[FQ_KEY] = { applied: true, origRequest, origCtor };
  try {
    w.Notification.requestPermission = function () {
      const result = 'denied';
      if (arguments.length > 0 && typeof arguments[0] === 'function') {
        try { arguments[0](result); } catch (_) {}
      }
      return Promise.resolve(result);
    };
  } catch (_) {}
  try {
    Object.defineProperty(w.Notification, 'permission', {
      configurable: true,
      get() { return 'denied'; },
    });
  } catch (_) {}
})();
`

const PAGE_WORLD_RESTORE = `
;(() => {
  const FQ_KEY = '__focusquote_notif__';
  const w = window;
  const state = w[FQ_KEY];
  if (!state || !state.applied) return;
  try { w.Notification.requestPermission = state.origRequest; } catch (_) {}
  try { delete w.Notification.permission; } catch (_) {}
  state.applied = false;
})();
`

const injectIntoPageWorld = (source: string): void => {
  // CSP on locked-down sites (e.g. GitHub gist raw views) may block inline
  // <script> injection. We catch silently — the isolated-world override
  // below still protects extension-context callers, and most pages allow it.
  try {
    const el = document.createElement("script")
    el.setAttribute(PAGE_MARKER, "")
    el.textContent = source
    ;(document.documentElement || document.head || document.body).appendChild(
      el,
    )
    el.remove()
  } catch (err) {
    console.warn("[FocusQuote] could not inject page-world script:", err)
  }
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
      injectIntoPageWorld(PAGE_WORLD_SCRIPT)
      btn.setIcon(icons.bellOff(tokens.icon.md))
      btn.setBadge(true)
      btn.setActive(true)
      btn.setLabel("Notifications blocked — click to allow")
    } else {
      removeIsolatedPatch()
      injectIntoPageWorld(PAGE_WORLD_RESTORE)
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
    injectIntoPageWorld(PAGE_WORLD_RESTORE)
  }
}
