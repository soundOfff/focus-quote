import { mountToolbar, type ToolbarShell } from "./shell"
import { installNotificationsButton } from "./notifications"
import { installAnnotateButton } from "./annotate"
import { installQuoteAiButton } from "./quoteAi"
import { installGuideButton } from "./guide"
import { closeOpenPopover } from "./popover"

/**
 * The toolbar is only relevant during a FocusQuote session. We mirror the
 * same storage key already used by the debug overlay (`focusquote.activeSession`)
 * so we don't introduce a new source of truth.
 */
const SESSION_KEY = "focusquote.activeSession"

interface ToolbarController {
  shell: ToolbarShell
  /** Per-feature teardown callbacks (e.g. restore Notification.requestPermission). */
  disposers: Array<() => void>
}

let controller: ToolbarController | null = null

const teardown = (): void => {
  if (!controller) return
  closeOpenPopover()
  for (const dispose of controller.disposers) {
    try {
      dispose()
    } catch (err) {
      console.warn("[FocusQuote] toolbar feature teardown failed:", err)
    }
  }
  controller.shell.destroy()
  controller = null
}

const setup = (): void => {
  if (controller) return
  const shell = mountToolbar()
  const disposers: Array<() => void> = []

  // Install order = visual order. Bell, pencil, quote, wand.
  // (Translate lives inline next to the Save Quote button — see content.ts.)
  disposers.push(installNotificationsButton(shell))
  disposers.push(installAnnotateButton(shell))
  disposers.push(installQuoteAiButton(shell))
  disposers.push(installGuideButton(shell))

  controller = { shell, disposers }
}

const refreshVisibility = async (): Promise<void> => {
  try {
    const stored = await chrome.storage.local.get(SESSION_KEY)
    const active = !!stored[SESSION_KEY]
    if (active) setup()
    else teardown()
  } catch {
    // chrome.storage can throw if the SW has gone away during a reload;
    // safest fallback is to hide.
    teardown()
  }
}

/**
 * Initialize the toolbar lifecycle. Safe to call multiple times — only the
 * first call wires listeners.
 */
let initialised = false
export const initFocusToolbar = (): void => {
  if (initialised) return
  initialised = true

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return
    if (SESSION_KEY in changes) {
      refreshVisibility().catch(() => {})
    }
  })

  refreshVisibility().catch(() => {})
}
