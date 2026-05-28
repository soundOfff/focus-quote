import { describe, it, expect } from "vitest"
import { randomUUID } from "node:crypto"
import { db } from "../src/db/client"
import { topics } from "../src/db/schema"
import { authedFetch, createTestUser, json } from "./helpers"

const seedTopic = async (userId: string, name = "Vault Topic") => {
  const id = randomUUID()
  await db.insert(topics).values({ id, userId, name })
  return id
}

describe("/api/topics/:id/vault", () => {
  it("creates, lists, and deletes a note scoped to the topic", async () => {
    const { userId, token } = await createTestUser()
    const topicId = await seedTopic(userId)
    const fetch = authedFetch(token)

    const created = await fetch(`/api/topics/${topicId}/vault`, {
      ...json({ kind: "note", body: "remember this" }),
      method: "POST",
    })
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as {
      item: { id: string; kind: string; body: string }
    }
    expect(createdBody.item.kind).toBe("note")
    expect(createdBody.item.body).toBe("remember this")

    const list = await fetch(`/api/topics/${topicId}/vault`)
    const listBody = (await list.json()) as { items: Array<{ id: string }> }
    expect(listBody.items).toHaveLength(1)

    const del = await fetch(
      `/api/topics/${topicId}/vault/${createdBody.item.id}`,
      { method: "DELETE" },
    )
    expect(del.status).toBe(200)
    const after = await fetch(`/api/topics/${topicId}/vault`)
    expect(((await after.json()) as { items: unknown[] }).items).toHaveLength(0)
  })

  it("rejects adding a vault item to a topic the user doesn't own (404)", async () => {
    const a = await createTestUser("a-vault@example.com")
    const b = await createTestUser("b-vault@example.com")
    const topicId = await seedTopic(a.userId)

    const res = await authedFetch(b.token)(`/api/topics/${topicId}/vault`, {
      ...json({ kind: "note", body: "intruder" }),
      method: "POST",
    })
    expect(res.status).toBe(404)
  })

  it("isolates vault items by user", async () => {
    const a = await createTestUser("a-vault2@example.com")
    const b = await createTestUser("b-vault2@example.com")
    const aTopic = await seedTopic(a.userId)
    const bTopic = await seedTopic(b.userId)
    await authedFetch(a.token)(`/api/topics/${aTopic}/vault`, {
      ...json({ kind: "note", body: "a-note" }),
      method: "POST",
    })

    // B cannot see A's items even when guessing A's topic id.
    const bView = await authedFetch(b.token)(`/api/topics/${aTopic}/vault`)
    expect(((await bView.json()) as { items: unknown[] }).items).toHaveLength(0)
    const bOwn = await authedFetch(b.token)(`/api/topics/${bTopic}/vault`)
    expect(((await bOwn.json()) as { items: unknown[] }).items).toHaveLength(0)
  })
})
