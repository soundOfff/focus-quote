import { tokens } from "./tokens"
import { apiPost, ApiCallError } from "./api"
import { popoverButton, popoverMonoLabel } from "./popover"
import type {
  GenerateJobAnswerRequest,
  GenerateJobAnswerResponse,
  JobAnswerContext,
} from "@focus-quote/shared"

/**
 * Shell-agnostic core of the "Draft answer" flow.
 *
 * The user highlights an application/interview question on the page; we send
 * the selected text plus their LOCAL CV + Answer Bank to the server, which
 * drafts an answer (ADR 0004 — the server never stores any of it). The draft
 * lands in an editable textarea with Copy + Regenerate.
 *
 * This module owns everything *except* where the UI is anchored, so it can be
 * mounted both inside the rail popover (Job Application Sessions — see
 * `draftAnswer.ts`) and inside the always-on selection bar (no session needed
 * — see `content.ts`). Nothing here reads the active session.
 */

// Keep in sync with JOB_PROFILE_KEY in shared/job-profile.ts. Hardcoded (like
// annotate.ts's active-session read) to avoid pulling the Effect-based modules
// into the content-script bundle.
export const JOB_PROFILE_KEY = "focusquote.jobProfile"

/** Server cap on the question (GenerateJobAnswerInput); slice before sending. */
const MAX_QUESTION_LEN = 2000

export interface LocalJobProfile {
  cv: string
  answerBank: JobAnswerContext[]
}

export const readJobProfile = async (): Promise<LocalJobProfile> => {
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
export const detectCompany = (question: string): string | null => {
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

export interface DraftAnswerHandle {
  /** Abort any in-flight request and clear the rendered content. */
  destroy: () => void
}

export interface MountDraftAnswerOptions {
  /** Element the draft UI renders into; its children are replaced per state. */
  container: HTMLElement
  /** The application question (the user's current selection). */
  question: string
  /** Local CV + Answer Bank used to tailor the draft. */
  profile: LocalJobProfile
  /** Best-effort company name for the "tailored" path; null is fine. */
  company: string | null
  /** Page the question came from (sent for server-side context only). */
  sourceUrl: string
  /** Called after each state render so anchored callers can re-position. */
  onLayout?: () => void
}

/**
 * Render the Draft answer flow into `container`: a question card, a loading
 * state, then an editable draft with Copy + Regenerate (or an error with
 * Retry). Owns its own AbortController; `destroy()` cancels and clears.
 */
export const mountDraftAnswer = (
  opts: MountDraftAnswerOptions,
): DraftAnswerHandle => {
  const { container, profile, company, sourceUrl, onLayout } = opts
  const question = opts.question.slice(0, MAX_QUESTION_LEN)
  let abort: AbortController | null = null
  let disposed = false

  type State =
    | { kind: "loading" }
    | { kind: "answer"; answer: string; contextual: boolean }
    | { kind: "error"; message: string }

  const render = (state: State) => {
    if (disposed) return
    const root = document.createElement("div")
    root.style.cssText =
      "display:flex;flex-direction:column;gap:10px;width:100%;box-sizing:border-box"

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
      container.replaceChildren(root)
      onLayout?.()
      return
    }

    if (state.kind === "error") {
      const err = document.createElement("div")
      err.textContent = state.message
      err.style.cssText = `color:${tokens.ink};font:${tokens.font};padding:4px 2px`
      const retry = popoverButton("Try again", "primary")
      retry.addEventListener("click", () => void runDraft())
      root.append(err, retry)
      container.replaceChildren(root)
      onLayout?.()
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
    container.replaceChildren(root)
    onLayout?.()
    ta.focus({ preventScroll: true })
  }

  const runDraft = async () => {
    if (disposed) return
    abort?.abort()
    abort = new AbortController()
    const signal = abort.signal
    render({ kind: "loading" })
    const body: GenerateJobAnswerRequest = {
      question,
      cv: profile.cv,
      answerBank: profile.answerBank,
      company,
      sourceUrl,
    }
    try {
      const res = await apiPost<GenerateJobAnswerResponse>(
        "/api/jobs/generate-answer",
        body,
        signal,
      )
      if (disposed || signal.aborted) return
      render({ kind: "answer", answer: res.answer, contextual: res.contextual })
    } catch (err) {
      if (disposed || signal.aborted) return
      // apiPost rejects aborts with a plain Error whose name is "AbortError"
      // (not a DOMException), e.g. when Regenerate cancels the prior request.
      if (err instanceof Error && err.name === "AbortError") return
      const message =
        err instanceof ApiCallError && err.status === 401
          ? "Sign in to FocusQuote to draft answers."
          : err instanceof ApiCallError && err.status === 403
            ? "Draft answer is turned off. Enable AI assistance in FocusQuote settings."
            : err instanceof ApiCallError && err.status === 429
              ? "Too many requests — give it a moment and try again."
              : "Couldn't draft an answer right now. Please try again."
      render({ kind: "error", message })
    }
  }

  void runDraft()

  return {
    destroy: () => {
      disposed = true
      abort?.abort()
      abort = null
      container.replaceChildren()
    },
  }
}
