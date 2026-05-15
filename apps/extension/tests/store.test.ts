import { beforeEach, describe, expect, it } from "vitest"
import { toolbarStore } from "@/content/store"
import { resetChromeStorage } from "./setup"

describe("toolbarStore", () => {
  beforeEach(() => {
    resetChromeStorage()
    sessionStorage.clear()
    toolbarStore.setState({
      chat: { isOpen: false, passage: "", sourceUrl: "", history: [] },
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
