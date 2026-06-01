import { icons } from "./icons"
import { tokens } from "./tokens"
import type { ToolbarShell } from "./shell"
import { openPopover, popoverButton, popoverMonoLabel, type PopoverHandle } from "./popover"
import { apiPost, ApiCallError } from "./api"
import { aiFeatureEnabled } from "./ai-gate"
import type {
  GenerateJobAnswerRequest,
  GenerateJobAnswerResponse,
  JobAnswerContext,
} from "@focus-quote/shared"

/**
 * "Draft answer" rail button (Job Application Sessions only).
 *
 * The user highlights an application/interview question on the page and clicks
 * this button; we send the selected text plus their LOCAL CV + Answer Bank to
 * the server, which drafts an answer (ADR 0004 — the server never stores any of
 * it). The draft lands in an editable textarea with Copy + Regenerate.
 *
 * The button is shown only while the active session's mode is "job"; we read
 * that from chrome.storage.local and react to changes so it appears/disappears
 * as sessions start and end.
 */

// Keep in sync with JOB_PROFILE_KEY in shared/job-profile.ts and
// ACTIVE_SESSION_KEY in services/sessions.ts. Hardcoded here (like annotate.ts's
// active-session read) to avoid pulling the Effect-based modules into the
// content-script bundle.
const JOB_PROFILE_KEY = "focusquote.jobProfile"
const ACTIVE_SESSION_KEY = "focusquote.activeSession"

interface LocalJobProfile {
  cv: string
  answerBank: JobAnswerContext[]
}

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

const readJobProfile = async (): Promise<LocalJobProfile> => {
  try {
    const out = await chrome.storage.local.get(JOB_PROFILE_KEY)
    const raw = out?.[JOB_PROFILE_KEY]
    if (!raw || typeof raw !== "object") return { cv: "", answerBank: [] }
    const obj = raw as { cv?: unknown; templates?: unknown }
    const cv = typeof obj.cv === "string" ? obj.cv : ""
    const answerBank: JobAnswerContext[] = Array.isArray(obj.templates)
      ? obj.templates.flatMap((t): JobAnswerContext[] => {
          if (!t || typeof t !== "object") return []
          const r = t as Record<string, unknown>
          const question = typeof r.question === "string" ? r.question : ""
          const answer = typeof r.answer === "string" ? r.answer : ""
          if (!answer.trim()) return []
          const category = typeof r.category === "string" ? r.category : undefined
          return [{ question, answer, ...(category ? { category } : {}) }]
        })
      : []
    return { cv, answerBank }
  } catch {
    return { cv: "", answerBank: [] }
  }
}

/**
 * Best-effort company extraction from the question text (e.g. "…work at Acme
 * Corp?"). The model also sees the full question, so this only nudges the
 * company-specific path; null is perfectly fine.
 */
const detectCompany = (question: string): string | null => {
  const m = question.match(/\b(?:at|join|with|for)\s+([A-Z][A-Za-z0-9&.'\- ]{1,40})/)
  if (!m || !m[1]) return null
  return m[1].replace(/[\s?.,!]+$/, "").trim() || null
}

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for pages/contexts where the async Clipboard API is blocked.
    try {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export const installDraftAnswerButton = (shell: ToolbarShell): (() => void) => {
  let currentPopover: PopoverHandle | null = null
  let currentAbort: AbortController | null = null

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

  const openMessage = (text: string) => {
    currentPopover = openPopover({
      title: "Draft answer",
      anchor: () => btn.getRect(),
      shell,
      dismissOnOutsideClick: false,
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
    const company = detectCompany(question)
    openDraft(question, profile, company)
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
        currentAbort?.abort()
        currentAbort = null
      },
    })
    const popover = currentPopover

    const render = (
      state:
        | { kind: "loading" }
        | { kind: "answer"; answer: string; contextual: boolean }
        | { kind: "error"; message: string },
    ) => {
      const root = document.createElement("div")
      root.style.cssText = "display:flex;flex-direction:column;gap:10px;min-width:320px;max-width:420px"

      // Question card.
      const card = document.createElement("div")
      card.style.cssText = [
        `border:1px solid ${tokens.rule}`,
        `border-left:3px solid ${tokens.amber}`,
        `border-radius:${tokens.radius}`,
        `background:${tokens.paper2}`,
        "padding:8px 10px",
        "display:flex",
        "flex-direction:column",
        "gap:4px",
      ].join(";")
      const qLabel = popoverMonoLabel(company ? `Question · ${company}` : "Question")
      const qText = document.createElement("div")
      qText.textContent = question
      qText.style.cssText = `color:${tokens.ink};font:${tokens.fontSerif};font-style:italic`
      card.append(qLabel, qText)
      root.appendChild(card)

      if (state.kind === "loading") {
        const loading = document.createElement("div")
        loading.textContent = "Drafting from your CV and answers…"
        loading.style.cssText = `color:${tokens.muted};font:${tokens.font};font-style:italic;padding:4px 2px`
        root.appendChild(loading)
        popover.setBody(root)
        return
      }

      if (state.kind === "error") {
        const err = document.createElement("div")
        err.textContent = state.message
        err.style.cssText = `color:${tokens.ink};font:${tokens.font};padding:4px 2px`
        const retry = popoverButton("Try again", "primary")
        retry.addEventListener("click", () => void runDraft())
        root.append(err, retry)
        popover.setBody(root)
        return
      }

      // Answer state: editable textarea + Copy / Regenerate.
      root.appendChild(popoverMonoLabel(state.contextual ? "Draft · tailored" : "Draft"))
      const ta = document.createElement("textarea")
      ta.value = state.answer
      ta.rows = 8
      ta.style.cssText = [
        "all:unset",
        "box-sizing:border-box",
        "width:100%",
        "padding:8px 10px",
        `background:${tokens.paper}`,
        `border:1px solid ${tokens.rule}`,
        `border-radius:${tokens.radius}`,
        `color:${tokens.ink}`,
        `font:${tokens.font}`,
        "line-height:1.5",
        "white-space:pre-wrap",
        "resize:vertical",
        "min-height:140px",
        "overflow:auto",
      ].join(";")
      root.appendChild(ta)

      const actions = document.createElement("div")
      actions.style.cssText = "display:flex;gap:8px;align-items:center"
      const copyBtn = popoverButton("Copy", "primary")
      const regenBtn = popoverButton("Regenerate", "ghost")
      const status = document.createElement("span")
      status.style.cssText = `color:${tokens.muted};font:${tokens.fontMono};margin-left:auto`

      copyBtn.addEventListener("click", () => {
        void copyText(ta.value).then((ok) => {
          status.textContent = ok ? "Copied ✓" : "Copy failed"
          window.setTimeout(() => {
            status.textContent = ""
          }, 1500)
        })
      })
      regenBtn.addEventListener("click", () => void runDraft())

      actions.append(copyBtn, regenBtn, status)
      root.appendChild(actions)
      popover.setBody(root)
      ta.focus()
    }

    const runDraft = async () => {
      if (popover !== currentPopover) return
      currentAbort?.abort()
      currentAbort = new AbortController()
      render({ kind: "loading" })
      const body: GenerateJobAnswerRequest = {
        question,
        cv: profile.cv,
        answerBank: profile.answerBank,
        company,
        sourceUrl: location.href,
      }
      try {
        const res = await apiPost<GenerateJobAnswerResponse>(
          "/api/jobs/generate-answer",
          body,
          currentAbort.signal,
        )
        if (popover !== currentPopover) return
        render({ kind: "answer", answer: res.answer, contextual: res.contextual })
      } catch (err) {
        if (popover !== currentPopover) return
        // apiPost rejects aborts with a plain Error whose name is "AbortError"
        // (not a DOMException), e.g. when Regenerate cancels the prior request.
        if (err instanceof Error && err.name === "AbortError") return
        const message =
          err instanceof ApiCallError && err.status === 403
            ? "Draft answer is turned off. Enable AI assistance in FocusQuote settings."
            : err instanceof ApiCallError && err.status === 429
              ? "Too many requests — give it a moment and try again."
              : "Couldn't draft an answer right now. Please try again."
        render({ kind: "error", message })
      }
    }

    void runDraft()
  }

  return () => {
    currentAbort?.abort()
    currentAbort = null
    currentPopover?.close()
    currentPopover = null
    chrome.storage.onChanged.removeListener(onStorageChanged)
  }
}
