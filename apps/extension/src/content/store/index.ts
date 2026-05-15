import { createStore } from "zustand/vanilla"
import { createJSONStorage, persist } from "zustand/middleware"
import type { GuideStep, QuoteAssistantTurn } from "@focus-quote/shared"
import { dualSessionStorage } from "./storageAdapter"

export interface ActionEvent {
  id: string
  sessionId: string
  actionKind: "click" | "focus" | "blur" | "submit" | "scroll" | "nav"
  payload: string
  at: string
}

interface ChatSlice {
  isOpen: boolean
  passage: string
  sourceUrl: string
  history: QuoteAssistantTurn[]
}

interface GuideSlice {
  isOpen: boolean
  steps: GuideStep[]
  index: number
  status: "playing" | "paused" | "stepping" | "ended"
  goal: string
}

interface ActionsSlice {
  buffer: ActionEvent[]
}

export interface ToolbarState {
  chat: ChatSlice
  guide: GuideSlice
  actions: ActionsSlice
  openChat: (passage: string, sourceUrl: string) => void
  closeChat: () => void
  appendChatTurn: (turn: QuoteAssistantTurn) => void
  resetChat: () => void
  openGuide: (goal: string, steps: GuideStep[]) => void
  closeGuide: () => void
  patchGuide: (next: Partial<GuideSlice>) => void
  appendAction: (event: ActionEvent) => void
  clearActionBuffer: () => void
}

const initialChat = (): ChatSlice => ({
  isOpen: false,
  passage: "",
  sourceUrl: "",
  history: [],
})

const initialGuide = (): GuideSlice => ({
  isOpen: false,
  steps: [],
  index: 0,
  status: "paused",
  goal: "",
})

const initialActions = (): ActionsSlice => ({ buffer: [] })

const STORE_NAME = "toolbar-state-v1"

export const toolbarStore = createStore<ToolbarState>()(
  persist(
    (set) => ({
      chat: initialChat(),
      guide: initialGuide(),
      actions: initialActions(),
      openChat: (passage, sourceUrl) =>
        set((s) => ({
          chat: s.chat.history.length
            ? { ...s.chat, isOpen: true }
            : { isOpen: true, passage, sourceUrl, history: [] },
        })),
      closeChat: () => set((s) => ({ chat: { ...s.chat, isOpen: false } })),
      appendChatTurn: (turn) =>
        set((s) => ({
          chat: {
            ...s.chat,
            history: [...s.chat.history, turn].slice(-40),
          },
        })),
      resetChat: () => set(() => ({ chat: initialChat() })),
      openGuide: (goal, steps) =>
        set(() => ({
          guide: {
            isOpen: true,
            steps,
            index: 0,
            status: "playing",
            goal,
          },
        })),
      closeGuide: () => set(() => ({ guide: { ...initialGuide(), isOpen: false } })),
      patchGuide: (next) =>
        set((s) => ({
          guide: { ...s.guide, ...next },
        })),
      appendAction: (event) =>
        set((s) => ({
          actions: {
            buffer: [...s.actions.buffer, event].slice(-500),
          },
        })),
      clearActionBuffer: () => set(() => ({ actions: initialActions() })),
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => dualSessionStorage),
      partialize: (s) => ({
        chat: s.chat,
        guide: s.guide,
        actions: s.actions,
      }),
    },
  ),
)
