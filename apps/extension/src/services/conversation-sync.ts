import { sha256Hex, type SyncJob } from "@focus-quote/shared"
import { conversationKey } from "../content/store/conversations"

/**
 * Deterministic server thread id for an article's Conversation. Derived from the
 * normalized URL so every device (and the server's per-user scope) converges on
 * a single ai_chat_thread per article.
 */
export const conversationThreadId = async (url: string): Promise<string> => {
  const digest = await sha256Hex(conversationKey(url))
  return `conv_${digest.slice(0, 32)}`
}

export interface ConversationTurnInput {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

/**
 * Translate a Conversation into offline-queue sync jobs: a thread upsert
 * (idempotent on the deterministic id) followed by one append per turn. Message
 * ids are minted once at enqueue time, so re-draining the queue is a no-op
 * server-side (append uses onConflictDoNothing).
 */
export const buildConversationSyncJobs = (params: {
  threadId: string
  sourceUrl: string
  passage: string
  turns: ReadonlyArray<ConversationTurnInput>
  now: string
}): SyncJob[] => {
  const jobs: SyncJob[] = [
    {
      kind: "upsertChatThread",
      id: params.threadId,
      sourceUrl: params.sourceUrl,
      passage: params.passage || null,
      createdAt: params.now,
      updatedAt: params.now,
    },
  ]
  for (const turn of params.turns) {
    jobs.push({
      kind: "appendChatMessage",
      id: turn.id,
      threadId: params.threadId,
      role: turn.role,
      content: turn.content,
      createdAt: turn.createdAt,
    })
  }
  return jobs
}
