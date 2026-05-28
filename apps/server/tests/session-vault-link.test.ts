import { describe, it, expect } from "vitest"
import { eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../src/db/client"
import { focusSessions, topicVaultItems, topics } from "../src/db/schema"
import { authedFetch, createTestUser, json } from "./helpers"

const seedSession = async (userId: string, topic: string | null) => {
  const id = randomUUID()
  await db.insert(focusSessions).values({ id, userId, topic })
  return id
}

describe("POST /api/focus-sessions/:id/vault-link", () => {
  it("creates the session's Topic on demand and saves a url vault item", async () => {
    const { userId, token } = await createTestUser()
    const sessionId = await seedSession(userId, "Research")

    const res = await authedFetch(token)(
      `/api/focus-sessions/${sessionId}/vault-link`,
      {
        ...json({ url: "https://example.com/paper", title: "A Paper" }),
        method: "POST",
      },
    )
    expect(res.status).toBe(201)

    // A Topic was created for the label and the session now links to it.
    const [session] = await db
      .select({ topicId: focusSessions.topicId })
      .from(focusSessions)
      .where(eq(focusSessions.id, sessionId))
    expect(session!.topicId).toBeTruthy()
    const [topic] = await db
      .select({ name: topics.name })
      .from(topics)
      .where(eq(topics.id, session!.topicId!))
    expect(topic!.name).toBe("Research")

    const items = await db
      .select({ kind: topicVaultItems.kind, body: topicVaultItems.body })
      .from(topicVaultItems)
      .where(eq(topicVaultItems.topicId, session!.topicId!))
    expect(items).toHaveLength(1)
    expect(items[0]!.kind).toBe("url")
    expect(items[0]!.body).toBe("https://example.com/paper")
  })

  it("rejects when the session has no topic yet (400)", async () => {
    const { userId, token } = await createTestUser()
    const sessionId = await seedSession(userId, null)
    const res = await authedFetch(token)(
      `/api/focus-sessions/${sessionId}/vault-link`,
      { ...json({ url: "https://example.com" }), method: "POST" },
    )
    expect(res.status).toBe(400)
  })

  it("rejects a session the user doesn't own (404)", async () => {
    const a = await createTestUser("a-vlink@example.com")
    const b = await createTestUser("b-vlink@example.com")
    const sessionId = await seedSession(a.userId, "Owned")
    const res = await authedFetch(b.token)(
      `/api/focus-sessions/${sessionId}/vault-link`,
      { ...json({ url: "https://example.com" }), method: "POST" },
    )
    expect(res.status).toBe(404)
  })
})
