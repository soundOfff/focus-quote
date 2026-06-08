import { describe, it, expect } from "vitest"
import { randomUUID } from "node:crypto"
import { db } from "../src/db/client"
import { focusSessions } from "../src/db/schema"
import { ensureTopicId } from "../src/lib/topic"
import { authedFetch, createTestUser } from "./helpers"

describe("issue #34 — Session DTO surfaces the Topic", () => {
  it("returns topic and topicId on the session DTO", async () => {
    const { userId, token } = await createTestUser()
    const topicId = await ensureTopicId(userId, "Linear Algebra")
    const sessionId = randomUUID()
    const now = new Date().toISOString()
    await db.insert(focusSessions).values({
      id: sessionId,
      userId,
      goal: "study eigenvectors",
      topic: "Linear Algebra",
      topicId,
      durationMinutes: 25,
      breakMinutes: 5,
      completed: true,
      startedAt: now,
      endedAt: now,
    })

    const res = await authedFetch(token)("/api/focus-sessions")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      sessions: Array<{ id: string; topic: string | null; topicId: string | null }>
    }
    const row = body.sessions.find((s) => s.id === sessionId)
    expect(row).toBeTruthy()
    expect(row!.topic).toBe("Linear Algebra")
    expect(row!.topicId).toBe(topicId)
  })

  it("returns null topic/topicId for a session that hasn't resolved one", async () => {
    const { userId, token } = await createTestUser()
    const sessionId = randomUUID()
    const now = new Date().toISOString()
    await db.insert(focusSessions).values({
      id: sessionId,
      userId,
      goal: "untopiced",
      durationMinutes: 25,
      breakMinutes: 5,
      completed: false,
      startedAt: now,
    })

    const res = await authedFetch(token)("/api/focus-sessions")
    const body = (await res.json()) as {
      sessions: Array<{ id: string; topic: string | null; topicId: string | null }>
    }
    const row = body.sessions.find((s) => s.id === sessionId)
    expect(row).toBeTruthy()
    expect(row!.topic).toBeNull()
    expect(row!.topicId).toBeNull()
  })
})
