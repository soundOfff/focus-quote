import { describe, it, expect } from "vitest"
import { and, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../src/db/client"
import {
  focusSessions,
  sessionVaultItems,
  topicVaultItems,
  topics,
} from "../src/db/schema"
import { authedFetch, createTestUser, json } from "./helpers"
import { ensureTopicId } from "../src/lib/topic"
import { flushPendingSessionVault } from "../src/lib/vault"

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

describe("POST /api/focus-sessions/:id/vault-link", () => {
  it("saves directly to the topic vault when the session already has a topic", async () => {
    const { userId, token } = await createTestUser()
    const topicId = await ensureTopicId(userId, "Research")
    const sessionId = await seedSession(userId, { topic: "Research", topicId })

    const res = await authedFetch(token)(
      `/api/focus-sessions/${sessionId}/vault-link`,
      {
        ...json({ url: "https://example.com/paper", title: "A Paper" }),
        method: "POST",
      },
    )
    expect(res.status).toBe(201)

    const items = await db
      .select({ kind: topicVaultItems.kind, body: topicVaultItems.body })
      .from(topicVaultItems)
      .where(eq(topicVaultItems.topicId, topicId))
    expect(items).toHaveLength(1)
    expect(items[0]!.kind).toBe("url")
    expect(items[0]!.body).toBe("https://example.com/paper")

    // Nothing left pending.
    const pending = await db
      .select({ id: sessionVaultItems.id })
      .from(sessionVaultItems)
      .where(eq(sessionVaultItems.sessionId, sessionId))
    expect(pending).toHaveLength(0)
  })

  it("dedupes the same URL within a topic instead of inserting twice", async () => {
    const { userId, token } = await createTestUser()
    const topicId = await ensureTopicId(userId, "Research")
    const sessionId = await seedSession(userId, { topic: "Research", topicId })
    const fetcher = authedFetch(token)
    const url = "https://example.com/paper"

    const first = await fetcher(`/api/focus-sessions/${sessionId}/vault-link`, {
      ...json({ url, title: "A Paper" }),
      method: "POST",
    })
    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as {
      item: { id: string; alreadyExisted: boolean }
    }
    expect(firstBody.item.alreadyExisted).toBe(false)

    const second = await fetcher(`/api/focus-sessions/${sessionId}/vault-link`, {
      ...json({ url, title: "A Paper" }),
      method: "POST",
    })
    expect(second.status).toBe(201)
    const secondBody = (await second.json()) as {
      item: { id: string; alreadyExisted: boolean }
    }
    // Idempotent: same row returned, flagged as a duplicate.
    expect(secondBody.item.alreadyExisted).toBe(true)
    expect(secondBody.item.id).toBe(firstBody.item.id)

    const items = await db
      .select({ id: topicVaultItems.id })
      .from(topicVaultItems)
      .where(eq(topicVaultItems.topicId, topicId))
    expect(items).toHaveLength(1)
  })

  it("dedupes a repeated URL among a session's pending items", async () => {
    const { userId, token } = await createTestUser()
    const sessionId = await seedSession(userId)
    const fetcher = authedFetch(token)
    const url = "https://example.com/pending"

    await fetcher(`/api/focus-sessions/${sessionId}/vault-link`, {
      ...json({ url }),
      method: "POST",
    })
    await fetcher(`/api/focus-sessions/${sessionId}/vault-link`, {
      ...json({ url }),
      method: "POST",
    })

    const pending = await db
      .select({ id: sessionVaultItems.id })
      .from(sessionVaultItems)
      .where(eq(sessionVaultItems.sessionId, sessionId))
    expect(pending).toHaveLength(1)
  })

  it("stashes a pending item (201) when the session has no topic yet", async () => {
    const { userId, token } = await createTestUser()
    const sessionId = await seedSession(userId)

    const res = await authedFetch(token)(
      `/api/focus-sessions/${sessionId}/vault-link`,
      { ...json({ url: "https://example.com" }), method: "POST" },
    )
    expect(res.status).toBe(201)

    const pending = await db
      .select({ kind: sessionVaultItems.kind, body: sessionVaultItems.body })
      .from(sessionVaultItems)
      .where(eq(sessionVaultItems.sessionId, sessionId))
    expect(pending).toHaveLength(1)
    expect(pending[0]!.kind).toBe("url")

    // Not committed to any topic until the session resolves one.
    const committed = await db
      .select({ id: topicVaultItems.id })
      .from(topicVaultItems)
      .where(eq(topicVaultItems.userId, userId))
    expect(committed).toHaveLength(0)
  })

  it("promotes pending items to Uncategorized when no topic is resolved", async () => {
    const { userId, token } = await createTestUser()
    const sessionId = await seedSession(userId)
    await authedFetch(token)(`/api/focus-sessions/${sessionId}/vault-link`, {
      ...json({ url: "https://example.com/a" }),
      method: "POST",
    })

    await flushPendingSessionVault(userId, sessionId)

    const pending = await db
      .select({ id: sessionVaultItems.id })
      .from(sessionVaultItems)
      .where(eq(sessionVaultItems.sessionId, sessionId))
    expect(pending).toHaveLength(0)

    const [uncat] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.userId, userId), eq(topics.name, "Uncategorized")))
    expect(uncat).toBeTruthy()
    const committed = await db
      .select({ body: topicVaultItems.body })
      .from(topicVaultItems)
      .where(eq(topicVaultItems.topicId, uncat!.id))
    expect(committed).toHaveLength(1)
    expect(committed[0]!.body).toBe("https://example.com/a")
  })

  it("promotes pending items when a topic is assigned manually", async () => {
    const { userId, token } = await createTestUser()
    const topicId = await ensureTopicId(userId, "Linear Algebra")
    const sessionId = await seedSession(userId)
    await authedFetch(token)(`/api/focus-sessions/${sessionId}/vault-link`, {
      ...json({ url: "https://example.com/eigen" }),
      method: "POST",
    })

    const res = await authedFetch(token)(
      `/api/focus-sessions/${sessionId}/topic`,
      { ...json({ topicId }), method: "POST" },
    )
    expect(res.status).toBe(200)

    const committed = await db
      .select({ body: topicVaultItems.body })
      .from(topicVaultItems)
      .where(eq(topicVaultItems.topicId, topicId))
    expect(committed).toHaveLength(1)
    expect(committed[0]!.body).toBe("https://example.com/eigen")
    const pending = await db
      .select({ id: sessionVaultItems.id })
      .from(sessionVaultItems)
      .where(eq(sessionVaultItems.sessionId, sessionId))
    expect(pending).toHaveLength(0)
  })

  it("rejects a session the user doesn't own (404)", async () => {
    const a = await createTestUser("a-vlink@example.com")
    const b = await createTestUser("b-vlink@example.com")
    const sessionId = await seedSession(a.userId, { topic: "Owned" })
    const res = await authedFetch(b.token)(
      `/api/focus-sessions/${sessionId}/vault-link`,
      { ...json({ url: "https://example.com" }), method: "POST" },
    )
    expect(res.status).toBe(404)
  })
})
