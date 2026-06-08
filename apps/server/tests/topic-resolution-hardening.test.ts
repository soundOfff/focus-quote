import { describe, it, expect, vi } from "vitest"
import { and, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../src/db/client"
import {
  focusSessions,
  sessionVaultItems,
  topicVaultItems,
  topics,
} from "../src/db/schema"
import { createTestUser } from "./helpers"

// Spy on the topic classifier so we can assert it is (not) re-run by the
// topicId gate, without making a real LLM call. Everything else in lib/llm is
// preserved so the rest of lib/topic keeps working.
const llmSpies = vi.hoisted(() => ({
  generateTopic: vi.fn(async () => "Freshly Classified"),
}))
vi.mock("../src/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/llm")>()
  return { ...actual, generateTopic: llmSpies.generateTopic }
})

import { ensureTopicId, maybeGenerateTopic } from "../src/lib/topic"
import { promoteSessionVaultItems, UNCATEGORIZED_TOPIC } from "../src/lib/vault"

const seedSession = async (
  userId: string,
  opts: { topic?: string | null; topicId?: string | null } = {},
) => {
  const id = randomUUID()
  await db.insert(focusSessions).values({
    id,
    userId,
    topic: opts.topic ?? null,
    topicId: opts.topicId ?? null,
  })
  return id
}

describe("issue #33 — Topic resolution & Vault promotion hardening", () => {
  describe("promoteSessionVaultItems upserts topicId on conflict", () => {
    it("MOVES an item already committed under a different topic to the new one", async () => {
      const { userId } = await createTestUser()
      const uncatId = await ensureTopicId(userId, UNCATEGORIZED_TOPIC)
      const realId = await ensureTopicId(userId, "Linear Algebra")
      const sessionId = await seedSession(userId)

      // The same stable id exists in two places: already flushed to
      // "Uncategorized", and still pending against the session (e.g. a replayed
      // offline save, then a manual reassignment to a real Topic).
      const itemId = randomUUID()
      const url = "https://example.com/eigenvectors"
      await db.insert(topicVaultItems).values({
        id: itemId,
        userId,
        topicId: uncatId,
        kind: "url",
        body: url,
      })
      await db.insert(sessionVaultItems).values({
        id: itemId,
        userId,
        sessionId,
        kind: "url",
        body: url,
      })

      await promoteSessionVaultItems(userId, sessionId, realId)

      // Exactly one row for the item, now under the newly-assigned Topic —
      // not dropped, not duplicated, not stranded under Uncategorized.
      const rows = await db
        .select({ id: topicVaultItems.id, topicId: topicVaultItems.topicId })
        .from(topicVaultItems)
        .where(eq(topicVaultItems.id, itemId))
      expect(rows).toHaveLength(1)
      expect(rows[0]!.topicId).toBe(realId)

      // The pending source row is gone (its target now exists under the right Topic).
      const pending = await db
        .select({ id: sessionVaultItems.id })
        .from(sessionVaultItems)
        .where(eq(sessionVaultItems.sessionId, sessionId))
      expect(pending).toHaveLength(0)
    })

    it("still promotes brand-new pending items (no conflict) under the topic", async () => {
      const { userId } = await createTestUser()
      const topicId = await ensureTopicId(userId, "Calculus")
      const sessionId = await seedSession(userId)
      await db.insert(sessionVaultItems).values({
        id: randomUUID(),
        userId,
        sessionId,
        kind: "note",
        body: "chain rule",
      })

      const moved = await promoteSessionVaultItems(userId, sessionId, topicId)
      expect(moved).toBe(1)

      const rows = await db
        .select({ body: topicVaultItems.body })
        .from(topicVaultItems)
        .where(eq(topicVaultItems.topicId, topicId))
      expect(rows).toHaveLength(1)
      expect(rows[0]!.body).toBe("chain rule")
    })
  })

  describe("ensureTopicId is safe under concurrent first-use of a new name", () => {
    it("two racing completions resolve one Topic row and neither throws", async () => {
      const { userId } = await createTestUser()
      const name = "Quantum Mechanics"

      // Concurrent resolves of the same brand-new category. Without an
      // onConflict upsert the second insert throws a UNIQUE violation.
      const ids = await Promise.all([
        ensureTopicId(userId, name),
        ensureTopicId(userId, name),
        ensureTopicId(userId, name),
      ])

      // All callers converge on the same id...
      expect(new Set(ids).size).toBe(1)
      // ...and exactly one Topic row exists.
      const rows = await db
        .select({ id: topics.id })
        .from(topics)
        .where(and(eq(topics.userId, userId), eq(topics.name, name)))
      expect(rows).toHaveLength(1)
    })
  })

  describe("maybeGenerateTopic gates on the stable topicId, not the legacy label", () => {
    it("does NOT reclassify when topicId is set but the legacy topic string is blank", async () => {
      const { userId } = await createTestUser()
      llmSpies.generateTopic.mockClear()
      const topicId = await ensureTopicId(userId, "Existing Topic")
      // topicId is the identity (ADR-0001); the mutable label is blank.
      const sessionId = await seedSession(userId, { topic: null, topicId })

      await maybeGenerateTopic(userId, sessionId)

      expect(llmSpies.generateTopic).not.toHaveBeenCalled()
      const [row] = await db
        .select({ topicId: focusSessions.topicId })
        .from(focusSessions)
        .where(eq(focusSessions.id, sessionId))
        .limit(1)
      expect(row!.topicId).toBe(topicId)
    })

    it("still classifies a session that has no topicId yet", async () => {
      const { userId } = await createTestUser()
      llmSpies.generateTopic.mockClear()
      const sessionId = await seedSession(userId, { topic: null, topicId: null })

      await maybeGenerateTopic(userId, sessionId)

      expect(llmSpies.generateTopic).toHaveBeenCalledTimes(1)
      const [row] = await db
        .select({ topic: focusSessions.topic, topicId: focusSessions.topicId })
        .from(focusSessions)
        .where(eq(focusSessions.id, sessionId))
        .limit(1)
      expect(row!.topic).toBe("Freshly Classified")
      expect(row!.topicId).toBeTruthy()
    })
  })
})
