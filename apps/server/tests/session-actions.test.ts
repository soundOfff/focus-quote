import { describe, it, expect } from "vitest"
import { authedFetch, createTestUser, json } from "./helpers"

describe("/api/session-actions", () => {
  it("stores and lists actions for owned session only", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const now = new Date().toISOString()

    await fetch(
      "/api/focus-sessions",
      json({
        id: "session-actions-s1",
        goal: "test",
        durationMinutes: 25,
        breakMinutes: 5,
        completed: false,
        startedAt: now,
        endedAt: null,
      }),
    )

    const post = await fetch(
      "/api/session-actions",
      json({
        actions: [
          {
            id: "a1",
            sessionId: "session-actions-s1",
            kind: "click",
            payload: '{"selector":"#x"}',
            at: now,
          },
        ],
      }),
    )
    expect(post.status).toBe(200)

    const list = await fetch("/api/session-actions?sessionId=session-actions-s1")
    expect(list.status).toBe(200)
    const body = (await list.json()) as {
      actions: Array<{ kind: string; payload: string }>
    }
    expect(body.actions).toHaveLength(1)
    expect(body.actions[0]?.kind).toBe("click")
  })
})
