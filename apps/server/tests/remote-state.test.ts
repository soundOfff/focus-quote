import { describe, expect, it } from "vitest"
import { authedFetch, createTestUser, json } from "./helpers"

describe("/api/settings", () => {
  it("auto-seeds defaults on first read", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)

    const initial = await fetch("/api/settings")
    expect(initial.status).toBe(200)
    const initialBody = (await initial.json()) as {
      settings: { theme: string; defaultDurationMinutes: number }
    }
    expect(initialBody.settings.theme).toBe("dark")
    expect(initialBody.settings.defaultDurationMinutes).toBe(25)
  })

  it("PUTs settings and reads them back", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: "light",
        defaultDurationMinutes: 45,
        defaultBreakMinutes: 10,
        translateFromLang: "en",
        translateToLang: "es",
        todayGoal: "deploy",
        debugOverlayEnabled: true,
        notificationsBlocked: true,
        toolbarSide: "left",
      }),
    })
    expect(res.status).toBe(200)
    const get = await fetch("/api/settings")
    const body = (await get.json()) as {
      settings: { theme: string; todayGoal: string | null; toolbarSide: string }
    }
    expect(body.settings.theme).toBe("light")
    expect(body.settings.todayGoal).toBe("deploy")
    expect(body.settings.toolbarSide).toBe("left")
  })
})

describe("/api/profile", () => {
  it("seeds and updates profile", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Ada",
        headline: "builder",
        photoMediaFileId: null,
      }),
    })
    expect(res.status).toBe(200)
    const get = await fetch("/api/profile")
    const body = (await get.json()) as {
      profile: { displayName: string; headline: string }
    }
    expect(body.profile.displayName).toBe("Ada")
    expect(body.profile.headline).toBe("builder")
  })
})

describe("/api/privacy", () => {
  it("round-trips blocklist as JSON", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const res = await fetch("/api/privacy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackUrls: true,
        blocklist: ["bank.example.com", "health.example.org"],
      }),
    })
    expect(res.status).toBe(200)
    const get = await fetch("/api/privacy")
    const body = (await get.json()) as {
      privacy: { trackUrls: boolean; blocklist: string[] }
    }
    expect(body.privacy.trackUrls).toBe(true)
    expect(body.privacy.blocklist).toEqual([
      "bank.example.com",
      "health.example.org",
    ])
  })
})

describe("/api/secrets", () => {
  it("returns empty summary when no secret stored", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const res = await fetch("/api/secrets/openrouter")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      secret: { hasValue: boolean; hint: string | null }
    }
    expect(body.secret.hasValue).toBe(false)
    expect(body.secret.hint).toBeNull()
  })

  it("rejects writes when SECRETS_ENCRYPTION_KEY is missing", async () => {
    // The test env intentionally omits SECRETS_ENCRYPTION_KEY → 503.
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const res = await fetch("/api/secrets/openrouter", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "sk-or-secret-1234567890" }),
    })
    expect(res.status).toBe(503)
  })
})

describe("/api/ai-history", () => {
  it("creates a thread, appends messages and lists them", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const created = await fetch(
      "/api/ai-history/threads",
      json({
        kind: "quote_assistant",
        passage: "hello world",
        sourceUrl: "https://example.com",
      }),
    )
    expect(created.status).toBe(201)
    const { thread } = (await created.json()) as {
      thread: { id: string; kind: string }
    }
    expect(thread.kind).toBe("quote_assistant")

    const appended = await fetch(
      `/api/ai-history/threads/${thread.id}/messages`,
      json({ role: "user", content: "Explain it" }),
    )
    expect(appended.status).toBe(201)

    const list = await fetch(`/api/ai-history/threads/${thread.id}/messages`)
    const listBody = (await list.json()) as {
      messages: Array<{ role: string; content: string }>
    }
    expect(listBody.messages).toHaveLength(1)
    expect(listBody.messages[0]?.role).toBe("user")
  })
})

describe("/api/toolbar-state", () => {
  it("upserts and reads ephemeral state", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const put = await fetch("/api/toolbar-state/toolbar-state-v1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "{\"chat\":{\"isOpen\":true}}" }),
    })
    expect(put.status).toBe(200)
    const get = await fetch("/api/toolbar-state/toolbar-state-v1")
    const body = (await get.json()) as {
      state: { payload: string } | null
    }
    expect(body.state?.payload).toBe("{\"chat\":{\"isOpen\":true}}")
  })
})
