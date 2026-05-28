import type { QuoteAssistantTurn } from "@focus-quote/shared"

/**
 * A persistent Quote+AI Conversation, scoped to a single article. Highlighted
 * passages are added as context to the latest turn; they don't start separate
 * chats. The `passage` is the most recent highlight used as context.
 */
export interface Conversation {
  passage: string
  history: QuoteAssistantTurn[]
}

/** Conversations keyed by normalized article URL. */
export type ConversationMap = Record<string, Conversation>

const MAX_TURNS = 40

/** Normalize an article URL into a stable conversation key (drop hash + trailing slash). */
export const conversationKey = (url: string): string => {
  try {
    const u = new URL(url)
    u.hash = ""
    const s = u.toString()
    return s.endsWith("/") ? s.slice(0, -1) : s
  } catch {
    return url
  }
}

export const getConversation = (
  map: ConversationMap,
  url: string,
): Conversation | undefined => map[conversationKey(url)]

/**
 * Open or continue the conversation for `url`. A non-empty `passage` becomes the
 * latest context; an empty one keeps the existing passage. History is preserved.
 */
export const openConversation = (
  map: ConversationMap,
  url: string,
  passage: string,
): ConversationMap => {
  const key = conversationKey(url)
  const existing = map[key]
  const next: Conversation = existing
    ? { passage: passage || existing.passage, history: existing.history }
    : { passage, history: [] }
  return { ...map, [key]: next }
}

/** Append a turn to the conversation for `url`, capping the retained history. */
export const appendTurn = (
  map: ConversationMap,
  url: string,
  turn: QuoteAssistantTurn,
): ConversationMap => {
  const key = conversationKey(url)
  const existing = map[key] ?? { passage: "", history: [] }
  return {
    ...map,
    [key]: {
      passage: existing.passage,
      history: [...existing.history, turn].slice(-MAX_TURNS),
    },
  }
}

/** Drop the conversation for `url`. */
export const clearConversation = (
  map: ConversationMap,
  url: string,
): ConversationMap => {
  const key = conversationKey(url)
  const { [key]: _removed, ...rest } = map
  return rest
}
