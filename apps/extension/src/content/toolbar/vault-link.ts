import type { ToolbarShell } from "./shell"
import { icons } from "./icons"
import { apiPost } from "./api"
import { openPopover, type PopoverHandle } from "./popover"

/**
 * In-session toolbar shortcut: attach the page the user is currently viewing
 * to the active Session's Topic Vault as a `url` Vault item (issue #13, story
 * 11). Reuses `POST /api/focus-sessions/:id/vault-link`, which lazily resolves
 * (and creates, if needed) the session's Topic before saving the link.
 *
 * The toolbar lives in a content script, so it has no offline queue of its own;
 * like the "promote tracked visit" button in the session detail, this saves
 * directly through the server proxy and is a no-op when signed out / offline.
 */

const SESSION_KEY = "focusquote.activeSession"

export interface VaultLinkDeps {
  /** Active session id, or null when no session is running. */
  getSessionId: () => string | null
  /** The page to attach — current URL + document title. */
  getPage: () => { url: string; title: string | null }
  /** POST helper (server proxy via the service worker). */
  post: (path: string, body: unknown) => Promise<unknown>
  /** Surface a transient message to the user. */
  notify: (message: string, variant?: "info" | "error") => void
}

export type VaultLinkResult =
  | { status: "no-session" }
  | { status: "saved" }
  | { status: "error"; message: string }

export const attachCurrentPageToVault = async (
  deps: VaultLinkDeps,
): Promise<VaultLinkResult> => {
  const sessionId = deps.getSessionId()
  if (!sessionId) {
    deps.notify(
      "Start a focus session to save this page to its topic vault.",
      "error",
    )
    return { status: "no-session" }
  }
  const { url, title } = deps.getPage()
  try {
    await deps.post(`/api/focus-sessions/${sessionId}/vault-link`, {
      url,
      title,
    })
    deps.notify("Saved to topic vault.")
    return { status: "saved" }
  } catch (err) {
    deps.notify("Couldn't save this page to the vault.", "error")
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

/** Read the active session id from the same storage key the toolbar tracks. */
const readSessionId = async (): Promise<string | null> => {
  try {
    const stored = await chrome.storage.local.get(SESSION_KEY)
    const active = stored[SESSION_KEY] as { sessionId?: string } | null
    return active?.sessionId ?? null
  } catch {
    return null
  }
}

/**
 * Install the "save link to vault" bookmark button on the toolbar. Returns a
 * disposer (the shell owns button removal on teardown, so it's a no-op here,
 * matching the other feature installers' contract).
 */
export const installVaultLinkButton = (shell: ToolbarShell): (() => void) => {
  let currentPopover: PopoverHandle | null = null

  const message = (text: string) => {
    currentPopover = openPopover({
      title: "Save to Vault",
      anchor: () => btn.getRect(),
      shell,
      dismissOnOutsideClick: true,
      body: text,
      onClose: () => {
        currentPopover = null
      },
    })
  }

  const onClick = async () => {
    if (currentPopover) {
      currentPopover.close()
      return
    }
    const result = await attachCurrentPageToVault({
      getSessionId: () => sessionId,
      getPage: () => ({ url: location.href, title: document.title || null }),
      post: (path, body) => apiPost(path, body),
      notify: (text) => message(text),
    })
    // The button momentarily reflects a successful save.
    if (result.status === "saved") {
      btn.setIcon(icons.check(16))
      window.setTimeout(() => btn.setIcon(icons.bookmark(16)), 1500)
    }
  }

  const btn = shell.addButton({
    id: "vault-link",
    label: "Save page to topic vault",
    icon: icons.bookmark(16),
    onClick: () => {
      void onClick()
    },
  })

  // Keep a fresh session id in scope so the click handler stays synchronous.
  let sessionId: string | null = null
  void readSessionId().then((id) => {
    sessionId = id
  })
  const onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local" || !(SESSION_KEY in changes)) return
    const next = changes[SESSION_KEY]?.newValue as { sessionId?: string } | null
    sessionId = next?.sessionId ?? null
  }
  chrome.storage.onChanged.addListener(onStorage)

  return () => {
    currentPopover?.close()
    chrome.storage.onChanged.removeListener(onStorage)
  }
}
