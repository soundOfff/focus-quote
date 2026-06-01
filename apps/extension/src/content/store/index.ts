import { createStore } from "zustand/vanilla"
import { createJSONStorage, persist } from "zustand/middleware"
import type { GuideStep, QuoteAssistantTurn } from "@focus-quote/shared"
import { dualSessionStorage } from "./storageAdapter"
import {
  appendTurn,
  conversationKey,
  openConversation,
  type ConversationMap,
} from "./conversations"

export interface ActionEvent {
  id: string
  sessionId: string
  actionKind: "click" | "focus" | "blur" | "submit" | "scroll" | "nav"
  payload: string
  at: string
}

interface ChatSlice {
  isOpen: boolean
  /** Normalized URL of the active conversation. */
  activeUrl: string
  /** Mirror of the active conversation's fields, for read convenience. */
  passage: string
  sourceUrl: string
  history: QuoteAssistantTurn[]
  /**
   * Whole-page context for the active chat when the user opened Quote+AI
   * without highlighting. Transient (re-captured on each open) and never
   * persisted — see `partialize`. Empty in passage mode.
   */
  pageContent: string | null
  /** Every article's Conversation, keyed by normalized URL. */
  conversations: ConversationMap
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
  openChat: (
    passage: string,
    sourceUrl: string,
    pageContent?: string | null,
  ) => void
  closeChat: () => void
  appendChatTurn: (turn: QuoteAssistantTurn) => void
  openGuide: (goal: string, steps: GuideStep[]) => void
  closeGuide: () => void
  patchGuide: (next: Partial<GuideSlice>) => void
  appendAction: (event: ActionEvent) => void
  clearActionBuffer: () => void
}

const initialChat = (): ChatSlice => ({
  isOpen: false,
  activeUrl: "",
  passage: "",
  sourceUrl: "",
  history: [],
  pageContent: null,
  conversations: {},
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
      openChat: (passage, sourceUrl, pageContent = null) =>
        set((s) => {
          const conversations = openConversation(
            s.chat.conversations,
            sourceUrl,
            passage,
          )
          const key = conversationKey(sourceUrl)
          const active = conversations[key] ?? { passage, history: [] }
          return {
            chat: {
              isOpen: true,
              activeUrl: key,
              sourceUrl: key,
              passage: active.passage,
              history: active.history,
              pageContent,
              conversations,
            },
          }
        }),
      closeChat: () => set((s) => ({ chat: { ...s.chat, isOpen: false } })),
      appendChatTurn: (turn) =>
        set((s) => {
          const conversations = appendTurn(
            s.chat.conversations,
            s.chat.activeUrl,
            turn,
          )
          const active = conversations[conversationKey(s.chat.activeUrl)] ?? {
            passage: s.chat.passage,
            history: [],
          }
          return { chat: { ...s.chat, history: active.history, conversations } }
        }),
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
      version: 1,
      // v0 stored a single global chat; v1 keys conversations by article URL.
      // Drop the old chat shape on upgrade; guide/actions carry over.
      migrate: (persisted, from) => {
        const prev = (persisted ?? {}) as Partial<ToolbarState>
        if (from < 1) return { ...prev, chat: initialChat() }
        return prev
      },
      storage: createJSONStorage(() => dualSessionStorage),
      // Never persist captured page text — it's transient context, re-captured
      // on each open. Keeps arbitrary page content out of session storage.
      partialize: (s) => ({
        chat: { ...s.chat, pageContent: null },
        guide: s.guide,
        actions: s.actions,
      }),
    },
  ),
)
