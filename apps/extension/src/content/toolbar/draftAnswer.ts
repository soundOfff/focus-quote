import { icons } from "./icons"
import { tokens } from "./tokens"
import type { ToolbarShell } from "./shell"
import { openPopover, type PopoverHandle } from "./popover"
import { aiFeatureEnabled } from "./ai-gate"
import {
  detectCompany,
  mountDraftAnswer,
  readJobProfile,
  type DraftAnswerHandle,
  type LocalJobProfile,
} from "./draft-answer-core"

/**
 * "Draft answer" rail button (Job Application Sessions only).
 *
 * The drafting flow itself lives in `draft-answer-core.ts` and is shared with
 * the always-on selection bar (which offers the same action without a session).
 * This module is just the rail-button shell: it shows the button only while the
 * active session's mode is "job", reading that from chrome.storage.local and
 * reacting to changes so it appears/disappears as sessions start and end.
 */

// Keep in sync with ACTIVE_SESSION_KEY in services/sessions.ts.
const ACTIVE_SESSION_KEY = "focusquote.activeSession"

const grabSelection = (): string => window.getSelection()?.toString().trim() ?? ""

const readActiveMode = async (): Promise<"focus" | "job" | null> => {
  try {
    const out = await chrome.storage.local.get(ACTIVE_SESSION_KEY)
    const active = out?.[ACTIVE_SESSION_KEY]
    if (!active || typeof active !== "object") return null
    const mode = (active as { mode?: unknown }).mode
    return mode === "job" ? "job" : "focus"
  } catch {
    return null
  }
}

export const installDraftAnswerButton = (shell: ToolbarShell): (() => void) => {
  let currentPopover: PopoverHandle | null = null
  let currentDraft: DraftAnswerHandle | null = null

  const btn = shell.addButton({
    id: "draft-answer",
    label: "Draft answer",
    icon: icons.sparkle(tokens.icon.md),
    onClick: () => {
      void onClick()
    },
  })

  // Job-mode only: hide unless an active session has mode === "job".
  const updateVisibility = async () => {
    const mode = await readActiveMode()
    btn.el.style.display = mode === "job" ? "" : "none"
  }
  btn.el.style.display = "none"
  void updateVisibility()

  const onStorageChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local" && ACTIVE_SESSION_KEY in changes) void updateVisibility()
  }
  chrome.storage.onChanged.addListener(onStorageChanged)

  const closeDraft = () => {
    currentDraft?.destroy()
    currentDraft = null
  }

  const openMessage = (text: string) => {
    currentPopover = openPopover({
      title: "Draft answer",
      anchor: () => btn.getRect(),
      shell,
      dismissOnOutsideClick: false,
      body: text,
      onClose: () => {
        currentPopover = null
        closeDraft()
      },
    })
  }

  const onClick = async () => {
    if (currentPopover) {
      currentPopover.close()
      return
    }
    if (!(await aiFeatureEnabled("jobAnswer"))) {
      openMessage(
        "Draft answer is turned off. Enable AI assistance in FocusQuote settings.",
      )
      return
    }
    if ((await readActiveMode()) !== "job") {
      openMessage(
        "Start a Job application session from the FocusQuote popup to draft answers.",
      )
      return
    }
    const question = grabSelection()
    if (!question) {
      openMessage("Select the application question on the page, then click Draft answer.")
      return
    }
    const profile = await readJobProfile()
    openDraft(question, profile, detectCompany(question))
  }

  const openDraft = (
    question: string,
    profile: LocalJobProfile,
    company: string | null,
  ) => {
    currentPopover = openPopover({
      title: "Draft answer",
      anchor: () => btn.getRect(),
      shell,
      dismissOnOutsideClick: false,
      onClose: () => {
        currentPopover = null
        closeDraft()
      },
    })
    currentDraft = mountDraftAnswer({
      container: currentPopover.body,
      question,
      profile,
      company,
      sourceUrl: location.href,
    })
  }

  return () => {
    closeDraft()
    currentPopover?.close()
    currentPopover = null
    chrome.storage.onChanged.removeListener(onStorageChanged)
  }
}
