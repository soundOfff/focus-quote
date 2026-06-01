import { beforeEach, describe, expect, it } from "vitest"
import { toolbarStore } from "@/content/store"
import { resetChromeStorage } from "./setup"

describe("toolbarStore", () => {
  beforeEach(() => {
    resetChromeStorage()
    sessionStorage.clear()
    toolbarStore.setState({
      chat: {
        isOpen: false,
        activeUrl: "",
        passage: "",
        sourceUrl: "",
        history: [],
        pageContent: null,
        conversations: {},
      },
      guide: { isOpen: false, steps: [], index: 0, status: "paused", goal: "" },
      actions: { buffer: [] },
    })
  })

  it("keeps chat history when closing chat", () => {
    toolbarStore.getState().openChat("passage", "https://example.com")
    toolbarStore
      .getState()
      .appendChatTurn({ role: "assistant", content: "Hello" })
    toolbarStore.getState().closeChat()

    const chat = toolbarStore.getState().chat
    expect(chat.isOpen).toBe(false)
    expect(chat.history).toHaveLength(1)
    expect(chat.passage).toBe("passage")
  })

  it("keeps separate conversations per article URL", () => {
    toolbarStore.getState().openChat("p-a", "https://a.example.com/article")
    toolbarStore.getState().appendChatTurn({ role: "user", content: "on a" })
    toolbarStore.getState().openChat("p-b", "https://b.example.com/article")
    toolbarStore.getState().appendChatTurn({ role: "user", content: "on b" })

    // Reopening A (no new highlight) restores A's thread, not B's.
    toolbarStore.getState().openChat("", "https://a.example.com/article")
    const chat = toolbarStore.getState().chat
    expect(chat.history).toHaveLength(1)
    expect(chat.history[0]!.content).toBe("on a")
    expect(chat.passage).toBe("p-a")
  })

  // Regression for #24: the Quote+AI panel subscribes to the store and rebuilds
  // its follow-up buttons whenever the *chat* changes. Action-capture writes a
  // burst of `appendAction` events during a focus session; if those changed the
  // chat reference, the panel would rebuild the buttons mid-click and the click
  // would never land. Zustand must keep `chat` reference-stable across writes to
  // other slices so the panel can cheaply skip those re-renders.
  it("keeps the chat reference stable when only the action buffer changes", () => {
    toolbarStore.getState().openChat("p", "https://example.com")
    const before = toolbarStore.getState().chat
    toolbarStore.getState().appendAction({
      id: "a1",
      sessionId: "s1",
      actionKind: "focus",
      payload: "{}",
      at: new Date().toISOString(),
    })
    expect(toolbarStore.getState().chat).toBe(before)
  })

  it("changes the chat reference when a chat turn is appended", () => {
    toolbarStore.getState().openChat("p", "https://example.com")
    const before = toolbarStore.getState().chat
    toolbarStore.getState().appendChatTurn({ role: "user", content: "hi" })
    expect(toolbarStore.getState().chat).not.toBe(before)
  })

  // #25: whole-page mode threads captured page text through openChat as a
  // transient field (re-captured each open, never persisted).
  it("carries pageContent for whole-page mode and preserves it across turns", () => {
    toolbarStore.getState().openChat("", "https://example.com", "full page text")
    expect(toolbarStore.getState().chat.passage).toBe("")
    expect(toolbarStore.getState().chat.pageContent).toBe("full page text")
    toolbarStore.getState().appendChatTurn({ role: "assistant", content: "ok" })
    expect(toolbarStore.getState().chat.pageContent).toBe("full page text")
  })

  it("defaults pageContent to null in passage mode", () => {
    toolbarStore.getState().openChat("p", "https://example.com")
    expect(toolbarStore.getState().chat.pageContent).toBeNull()
  })

  it("tracks guide status and action buffer", () => {
    toolbarStore.getState().openGuide("do thing", [
      { instruction: "step", description: "desc", x: 0.5, y: 0.5 },
    ])
    toolbarStore.getState().patchGuide({ index: 1, status: "ended" })
    toolbarStore.getState().appendAction({
      id: "a1",
      sessionId: "s1",
      actionKind: "click",
      payload: "{}",
      at: new Date().toISOString(),
    })

    const state = toolbarStore.getState()
    expect(state.guide.status).toBe("ended")
    expect(state.actions.buffer).toHaveLength(1)
  })
})
