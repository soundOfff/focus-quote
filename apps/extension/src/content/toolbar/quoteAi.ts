import { icons } from "./icons"
import { tokens } from "./tokens"
import type { ToolbarShell } from "./shell"
import {
  openPopover,
  popoverComposer,
  type PopoverHandle,
} from "./popover"
import { apiPost, ApiCallError } from "./api"
import { toolbarStore } from "../store"
import type {
  QuoteAssistantRequest,
  QuoteAssistantResponse,
  QuoteAssistantTurn,
} from "@focus-quote/shared"

/**
 * Quote + AI panel — Direction A.
 *
 * The user highlights a passage on the page, clicks the rail's Quote+AI
 * button, and the panel shows:
 *
 *   1. The highlighted passage as a paper card with an amber left rail and a
 *      mono "FROM <host> · <time>" meta line above an italic serif body.
 *   2. The latest assistant reply as a "SUMMARY" block (sage-ink mono kicker
 *      + sparkle glyph + sans body).
 *   3. Any numbered follow-up suggestions parsed out of the reply, each as
 *      a paper-2 button with an "01 / 02 / 03" amber badge.
 *   4. A footer composer to ask follow-ups (single amber action: "Ask").
 *
 * The full chat history is preserved in the toolbar store — older turns
 * scroll out of the visible summary but persist so the next reply has
 * full context (the API call sends the whole history). The panel itself
 * always shows the latest exchange so the design reads as a single moment
 * of insight.
 */

const grabSelection = (): string => {
  const sel = window.getSelection()?.toString().trim()
  return sel ?? ""
}

const formatMeta = (sourceUrl: string | null | undefined): string => {
  const time = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  let host = "page"
  if (sourceUrl) {
    try {
      host = new URL(sourceUrl).hostname.replace(/^www\./, "")
    } catch {
      /* malformed URL — fall back to "page" */
    }
  }
  return `From ${host} · ${time}`
}

interface ParsedReply {
  summary: string
  followUps: string[]
}

/**
 * Pull a trailing numbered or bulleted list off the assistant's reply so we
 * can render them as the "Suggested follow-ups" buttons. Returns the body
 * minus those lines as `summary`. Falls back to the full text when no list
 * is detected.
 */
const parseReply = (text: string): ParsedReply => {
  const trimmed = text.trim()
  if (!trimmed) return { summary: "", followUps: [] }

  // Walk the lines from the end, collecting list-style items.
  const lines = trimmed.split(/\r?\n/)
  const followUps: string[] = []
  let cut = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i]?.trim() ?? ""
    if (raw === "") {
      // Skip blank gaps between items — keep walking up.
      if (followUps.length > 0) continue
      cut = i
      continue
    }
    // Match "1.", "1)", "- ", "* ", "• " at the start.
    const m = raw.match(/^(?:[0-9]+[.)]|[-*•])\s+(.*\??)$/)
    if (m && m[1]) {
      followUps.unshift(m[1].trim())
      cut = i
      continue
    }
    break
  }

  if (followUps.length < 2) {
    return { summary: trimmed, followUps: [] }
  }
  const summary = lines.slice(0, cut).join("\n").trim()
  return {
    summary: summary || trimmed,
    followUps: followUps.slice(0, 3),
  }
}

// ----- DOM builders ---------------------------------------------------------

const buildPassageCard = (passage: string, sourceUrl: string) => {
  const wrap = document.createElement("div")
  wrap.style.cssText = "padding:12px 14px 4px"

  const card = document.createElement("div")
  card.style.cssText = [
    `background:${tokens.paper}`,
    `border:1px solid ${tokens.rule}`,
    "border-radius:9px",
    "padding:10px 12px 10px 14px",
    "position:relative",
  ].join(";")

  // Amber left rail per the spec — absolute, 3px wide, inset 8/8 vertical.
  const rail = document.createElement("div")
  rail.style.cssText = [
    "position:absolute",
    "left:0",
    "top:8px",
    "bottom:8px",
    "width:3px",
    `background:${tokens.amber}`,
    "border-radius:99px",
  ].join(";")

  const meta = document.createElement("div")
  meta.style.cssText = [
    `font:${tokens.fontMono}`,
    "font-size:9px",
    "font-weight:500",
    "letter-spacing:0.12em",
    "text-transform:uppercase",
    `color:${tokens.muted}`,
    "margin-bottom:5px",
  ].join(";")
  meta.textContent = formatMeta(sourceUrl)

  const body = document.createElement("div")
  body.setAttribute("data-fq-scrollbar", "")
  body.style.cssText = [
    `font:${tokens.fontSerif}`,
    "font-style:italic",
    "font-size:13px",
    "line-height:1.45",
    `color:${tokens.ink}`,
    "letter-spacing:-0.005em",
    "max-height:96px",
    "overflow:auto",
    "white-space:pre-wrap",
    "word-break:break-word",
  ].join(";")
  body.textContent = passage

  card.append(rail, meta, body)
  wrap.appendChild(card)
  return wrap
}

const buildSummaryBlock = (
  initialState: "loading" | "text",
  initialText: string,
) => {
  const wrap = document.createElement("div")
  wrap.style.cssText = "padding:10px 14px 4px"

  const labelRow = document.createElement("div")
  labelRow.style.cssText = [
    `font:${tokens.fontMono}`,
    "font-size:9.5px",
    "font-weight:500",
    "letter-spacing:0.12em",
    "text-transform:uppercase",
    `color:${tokens.sageInk}`,
    "display:flex",
    "align-items:center",
    "gap:5px",
    "margin-bottom:6px",
  ].join(";")
  const sparkle = document.createElement("span")
  sparkle.style.cssText = "display:inline-flex;align-items:center"
  sparkle.innerHTML = icons.sparkle(11)
  const labelText = document.createElement("span")
  labelText.textContent = "Summary"
  labelRow.append(sparkle, labelText)

  const body = document.createElement("p")
  body.style.cssText = [
    "margin:0",
    "font-size:12.5px",
    "line-height:1.55",
    `color:${tokens.ink2}`,
    "white-space:pre-wrap",
    "word-break:break-word",
  ].join(";")
  if (initialState === "loading") {
    body.style.color = tokens.muted
    body.style.fontStyle = "italic"
    body.textContent = "Reading the passage…"
  } else {
    body.textContent = initialText
  }

  wrap.append(labelRow, body)
  return { wrap, body, labelRow }
}

const buildFollowUpsList = () => {
  const wrap = document.createElement("div")
  wrap.style.cssText = "padding:0 14px 12px"

  const label = document.createElement("div")
  label.style.cssText = [
    `font:${tokens.fontMono}`,
    "font-size:9.5px",
    "font-weight:500",
    "letter-spacing:0.12em",
    "text-transform:uppercase",
    `color:${tokens.muted}`,
    "margin-top:12px",
    "margin-bottom:4px",
  ].join(";")
  label.textContent = "Suggested follow-ups"

  const list = document.createElement("ul")
  list.style.cssText =
    "margin:0;padding:0;list-style:none;display:grid;gap:4px"

  wrap.append(label, list)
  wrap.style.display = "none"
  return { wrap, list }
}

const buildFollowUpButton = (
  badge: string,
  text: string,
  onClick: () => void,
): HTMLButtonElement => {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "width:100%",
    "text-align:left",
    `background:${tokens.paper2}`,
    `border:1px solid ${tokens.rule}`,
    "border-radius:7px",
    "padding:7px 9px",
    "font-size:12px",
    "font-weight:500",
    `color:${tokens.ink}`,
    "cursor:pointer",
    "display:flex",
    "align-items:center",
    "gap:7px",
    "line-height:1.3",
    "transition:background-color 120ms ease,border-color 120ms ease",
  ].join(";")
  btn.addEventListener("mouseenter", () => {
    btn.style.backgroundColor = tokens.paper
    btn.style.borderColor = tokens.popupBorder
  })
  btn.addEventListener("mouseleave", () => {
    btn.style.backgroundColor = tokens.paper2
    btn.style.borderColor = tokens.rule
  })
  const badgeEl = document.createElement("span")
  badgeEl.style.cssText = [
    `font:${tokens.fontMono}`,
    "font-size:9px",
    "font-weight:600",
    `color:${tokens.amberDeep}`,
    "letter-spacing:0.06em",
    `border:1px solid ${tokens.clayHairline}`,
    "border-radius:4px",
    "padding:1px 4px",
    "flex-shrink:0",
  ].join(";")
  badgeEl.textContent = badge
  const textEl = document.createElement("span")
  textEl.textContent = text
  textEl.style.cssText = "min-width:0;flex:1"
  btn.append(badgeEl, textEl)
  btn.addEventListener("click", onClick)
  return btn
}

// ----- Public API -----------------------------------------------------------

export const installQuoteAiButton = (shell: ToolbarShell): (() => void) => {
  let currentPopover: PopoverHandle | null = null
  let currentAbort: AbortController | null = null
  let unsubStore: (() => void) | null = null

  const onClick = () => {
    if (currentPopover) {
      currentPopover.close()
      return
    }
    const state = toolbarStore.getState().chat
    if (state.history.length === 0) {
      const passage = grabSelection()
      if (!passage) {
        openMessage(
          "Highlight some text on the page first, then click Quote+AI to ask the assistant about it.",
        )
        return
      }
      toolbarStore.getState().openChat(passage, location.href)
    } else {
      toolbarStore.getState().openChat(state.passage, state.sourceUrl)
    }
    openChat()
  }

  const openMessage = (text: string) => {
    currentPopover = openPopover({
      title: "Quote · AI",
      anchor: () => btn.getRect(),
      shell,
      dismissOnOutsideClick: false,
      body: text,
      onClose: () => {
        currentPopover = null
      },
    })
  }

  const openChat = () => {
    currentPopover = openPopover({
      title: "Quote · AI",
      anchor: () => btn.getRect(),
      shell,
      dismissOnOutsideClick: false,
      onClose: () => {
        currentPopover = null
        currentAbort?.abort()
        currentAbort = null
        unsubStore?.()
        unsubStore = null
        toolbarStore.getState().closeChat()
      },
    })

    // Body layout: passage → summary → follow-ups → composer.
    const root = document.createElement("div")
    root.style.cssText = "display:flex;flex-direction:column"

    const initialChat = toolbarStore.getState().chat
    const passageNode = buildPassageCard(
      initialChat.passage,
      initialChat.sourceUrl,
    )

    const lastAssistant = lastAssistantText(initialChat.history)
    const parsedInitial = parseReply(lastAssistant ?? "")
    const summaryBlock = buildSummaryBlock(
      lastAssistant ? "text" : "loading",
      parsedInitial.summary,
    )

    const followUps = buildFollowUpsList()
    const composer = popoverComposer({
      placeholder: "Ask a follow-up — or leave blank to star ★",
      buttonLabel: "Ask",
      hint: "⌘ ↵",
      onSubmit: (value) => sendTurn(value),
    })

    root.append(passageNode, summaryBlock.wrap, followUps.wrap, composer.root)
    currentPopover.setBody(root)

    const renderFromStore = () => {
      const chat = toolbarStore.getState().chat
      const lastReply = lastAssistantText(chat.history)
      if (!lastReply) {
        summaryBlock.body.style.color = tokens.muted
        summaryBlock.body.style.fontStyle = "italic"
        summaryBlock.body.textContent = "Reading the passage…"
        followUps.wrap.style.display = "none"
        return
      }
      const parsed = parseReply(lastReply)
      summaryBlock.body.style.color = tokens.ink2
      summaryBlock.body.style.fontStyle = "normal"
      summaryBlock.body.textContent = parsed.summary
      followUps.list.replaceChildren()
      if (parsed.followUps.length === 0) {
        followUps.wrap.style.display = "none"
        return
      }
      followUps.wrap.style.display = ""
      parsed.followUps.forEach((q, i) => {
        const li = document.createElement("li")
        li.appendChild(
          buildFollowUpButton(
            String(i + 1).padStart(2, "0"),
            q,
            () => sendTurn(q),
          ),
        )
        followUps.list.appendChild(li)
      })
    }

    renderFromStore()
    unsubStore = toolbarStore.subscribe(() => renderFromStore())

    const sendTurn = async (rawMessage: string) => {
      const trimmed = rawMessage.trim()
      composer.input.value = ""
      composer.setBusy(true)

      if (trimmed.length > 0) {
        toolbarStore
          .getState()
          .appendChatTurn({ role: "user", content: trimmed })
      }

      // Show loading state in the summary block while the request flies.
      summaryBlock.body.style.color = tokens.muted
      summaryBlock.body.style.fontStyle = "italic"
      summaryBlock.body.textContent = trimmed
        ? `Thinking about "${trimmed.slice(0, 60)}${trimmed.length > 60 ? "…" : ""}"…`
        : "Reading the passage…"
      followUps.wrap.style.display = "none"

      currentAbort?.abort()
      currentAbort = new AbortController()

      const chat = toolbarStore.getState().chat
      const historyForRequest =
        trimmed.length > 0 ? chat.history.slice(0, -1) : chat.history

      try {
        const body: QuoteAssistantRequest = {
          passage: chat.passage,
          sourceUrl: chat.sourceUrl,
          history: historyForRequest,
          userMessage: trimmed,
        }
        const res = await apiPost<QuoteAssistantResponse>(
          "/api/ai/quote-assistant",
          body,
          currentAbort.signal,
        )
        toolbarStore
          .getState()
          .appendChatTurn({ role: "assistant", content: res.reply })
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        const message =
          err instanceof ApiCallError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error"
        summaryBlock.body.style.color = tokens.clayInk
        summaryBlock.body.style.fontStyle = "normal"
        summaryBlock.body.textContent = `Couldn't reach the assistant. ${message}`
      } finally {
        composer.setBusy(false)
        composer.focus()
      }
    }

    // Auto-fire an initial request if the thread is empty — this is the
    // "default" state shown in the handoff: passage in, summary appears.
    if (toolbarStore.getState().chat.history.length === 0) {
      sendTurn("")
    } else {
      composer.focus()
    }
  }

  const btn = shell.addButton({
    id: "quote-ai",
    label: "Quote + AI",
    icon: icons.quote(tokens.icon.md),
    onClick,
  })

  return () => {
    currentAbort?.abort()
    currentPopover?.close()
    unsubStore?.()
    unsubStore = null
    toolbarStore.getState().closeChat()
  }
}

const lastAssistantText = (
  history: ReadonlyArray<QuoteAssistantTurn>,
): string | null => {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i]
    if (turn?.role === "assistant") return turn.content
  }
  return null
}
