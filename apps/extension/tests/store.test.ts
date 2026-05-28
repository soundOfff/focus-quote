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
