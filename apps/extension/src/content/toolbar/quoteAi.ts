import { icons } from "./icons"
import { tokens } from "./tokens"
import type { ToolbarShell } from "./shell"
import {
  openPopover,
  popoverButton,
  popoverInput,
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
 * Quote+AI: highlight a passage on the page, click the button, and chat with
 * an assistant about it. Routes calls through the FocusQuote server proxy so
 * the Anthropic key stays on the server (see /api/ai/quote-assistant).
 */

const grabSelection = (): string => {
  const sel = window.getSelection()?.toString().trim()
  return sel ?? ""
}

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
      title: "Quote + AI",
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
      title: "Quote + AI",
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

    const root = document.createElement("div")
    root.style.cssText = "display:flex;flex-direction:column;gap:8px;min-width:300px"

    const passageBox = document.createElement("div")
    passageBox.style.cssText = [
      "padding:6px 8px",
      `background:${tokens.navyDeep}`,
      "border-left:2px solid " + tokens.accent,
      "border-radius:2px",
      "font-size:12px",
      "line-height:1.4",
      `color:${tokens.inkMute}`,
      "max-height:80px",
      "overflow:auto",
      "white-space:pre-wrap",
      "word-break:break-word",
    ].join(";")

    const log = document.createElement("div")
    log.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "gap:6px",
      "max-height:260px",
      "overflow-y:auto",
      "overflow-x:hidden",
      "padding-right:0",
      "margin-right:0",
      `--border:${tokens.hairline}`,
      "scrollbar-width:thin",
      "scrollbar-color:var(--border) transparent",
    ].join(";")

    const inputRow = document.createElement("div")
    inputRow.style.cssText = "display:flex;gap:6px;align-items:center"
    const input = popoverInput("Ask a follow-up — or leave blank to start")
    const sendBtn = popoverButton("Ask")

    inputRow.append(input, sendBtn)
    root.append(passageBox, log, inputRow)
    currentPopover.setBody(root)

    const addBubble = (
      role: QuoteAssistantTurn["role"] | "system" | "loading",
      text: string,
    ): { el: HTMLDivElement; replaceText: (t: string) => void } => {
      const el = document.createElement("div")
      const isUser = role === "user"
      const isSystem = role === "system"
      const isLoading = role === "loading"
      el.style.cssText = [
        "padding:8px 10px",
        "border-radius:6px",
        "font-size:13px",
        "line-height:1.5",
        "white-space:pre-wrap",
        "word-break:break-word",
        "max-width:100%",
        isUser ? "align-self:flex-end" : "align-self:flex-start",
        isUser
          ? `background:${tokens.accent};color:#fff`
          : `background:${tokens.navyDeep};color:${tokens.ink};border:1px solid ${tokens.hairline}`,
        isSystem ? `color:${tokens.inkMute};font-style:italic` : "",
        isLoading ? "opacity:0.7" : "",
      ].join(";")
      el.textContent = text
      log.appendChild(el)
      log.scrollTop = log.scrollHeight
      return {
        el,
        replaceText: (t) => {
          el.textContent = t
        },
      }
    }

    const renderFromStore = () => {
      const chat = toolbarStore.getState().chat
      const passage = chat.passage
      passageBox.textContent =
        passage.length > 320 ? passage.slice(0, 320) + "…" : passage
      log.replaceChildren()
      for (const turn of chat.history) {
        addBubble(turn.role, turn.content)
      }
    }

    renderFromStore()
    unsubStore = toolbarStore.subscribe(() => renderFromStore())

    const sendTurn = async (userMessage: string) => {
      const trimmed = userMessage.trim()
      input.value = ""
      sendBtn.setAttribute("disabled", "true")
      sendBtn.style.opacity = "0.6"
      sendBtn.style.pointerEvents = "none"

      if (trimmed.length > 0) {
        toolbarStore.getState().appendChatTurn({ role: "user", content: trimmed })
      }
      const loading = addBubble("loading", "Thinking…")

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
        loading.el.remove()
        toolbarStore
          .getState()
          .appendChatTurn({ role: "assistant", content: res.reply })
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          loading.el.remove()
          return
        }
        const message =
          err instanceof ApiCallError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error"
        loading.replaceText(`Couldn't reach the assistant. ${message}`)
        loading.el.style.borderColor = tokens.accentDim
        loading.el.style.opacity = "1"
      } finally {
        sendBtn.removeAttribute("disabled")
        sendBtn.style.opacity = "1"
        sendBtn.style.pointerEvents = "auto"
        input.focus()
      }
    }

    sendBtn.addEventListener("click", () => sendTurn(input.value))
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        sendTurn(input.value)
      }
    })

    if (toolbarStore.getState().chat.history.length === 0) {
      sendTurn("")
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
