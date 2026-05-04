import { describe, it, expect } from "vitest"
import { app } from "../src/app"
import { authedFetch, createTestUser, json } from "./helpers"

describe("/api/quotes", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.request("/api/quotes")
    expect(res.status).toBe(401)
  })

  it("creates and lists a quote", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)

    const created = await fetch("/api/quotes", {
      ...json({
        text: "Stay hungry, stay foolish.",
        sourceUrl: "https://example.com",
        sourceTitle: "Stanford 2005",
        tag: "jobs",
      }),
    })
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as { quote: { id: string; text: string } }
    expect(createdBody.quote.text).toBe("Stay hungry, stay foolish.")

    const list = await fetch("/api/quotes")
    expect(list.status).toBe(200)
    const listBody = (await list.json()) as { quotes: Array<{ id: string }> }
    expect(listBody.quotes).toHaveLength(1)
    expect(listBody.quotes[0]!.id).toBe(createdBody.quote.id)
  })

  it("isolates quotes by user", async () => {
    const a = await createTestUser("a@example.com")
    const b = await createTestUser("b@example.com")
    await authedFetch(a.token)("/api/quotes", { ...json({ text: "A's quote", sourceUrl: null, sourceTitle: null, tag: null }) })
    await authedFetch(b.token)("/api/quotes", { ...json({ text: "B's quote", sourceUrl: null, sourceTitle: null, tag: null }) })

    const aList = await authedFetch(a.token)("/api/quotes")
    const aBody = (await aList.json()) as { quotes: Array<{ text: string }> }
    expect(aBody.quotes.map((q) => q.text)).toEqual(["A's quote"])

    const bList = await authedFetch(b.token)("/api/quotes")
    const bBody = (await bList.json()) as { quotes: Array<{ text: string }> }
    expect(bBody.quotes.map((q) => q.text)).toEqual(["B's quote"])
  })

  it("filters by ?q on text and tag", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    await fetch("/api/quotes", { ...json({ text: "shortest paths", sourceUrl: null, sourceTitle: null, tag: "graphs" }) })
    await fetch("/api/quotes", { ...json({ text: "memoize", sourceUrl: null, sourceTitle: null, tag: "tricks" }) })

    const byText = await fetch("/api/quotes?q=shortest")
    expect(((await byText.json()) as { quotes: unknown[] }).quotes).toHaveLength(1)

    const byTag = await fetch("/api/quotes?q=tricks")
    expect(((await byTag.json()) as { quotes: unknown[] }).quotes).toHaveLength(1)
  })

  it("deletes a quote (and 404s for someone else's)", async () => {
    const a = await createTestUser("a2@example.com")
    const b = await createTestUser("b2@example.com")
    const created = await authedFetch(a.token)("/api/quotes", {
      ...json({ text: "owned by a", sourceUrl: null, sourceTitle: null, tag: null }),
    })
    const { quote } = (await created.json()) as { quote: { id: string } }

    const wrongUser = await authedFetch(b.token)(`/api/quotes/${quote.id}`, { method: "DELETE" })
    expect(wrongUser.status).toBe(404)

    const ok = await authedFetch(a.token)(`/api/quotes/${quote.id}`, { method: "DELETE" })
    expect(ok.status).toBe(200)

    const list = await authedFetch(a.token)("/api/quotes")
    expect(((await list.json()) as { quotes: unknown[] }).quotes).toHaveLength(0)
  })
})
