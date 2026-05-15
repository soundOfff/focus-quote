import { describe, expect, it } from "vitest"
import { authedFetch, createTestUser, json } from "./helpers"

describe("/api/media", () => {
  it("uploads and fetches user-scoped media", async () => {
    const { token } = await createTestUser()
    const fetch = authedFetch(token)
    const payload = {
      kind: "profile_photo",
      mimeType: "image/png",
      dataBase64: "aGVsbG8=",
      byteSize: 5,
      sessionId: null,
    }
    const uploaded = await fetch("/api/media", json(payload))
    expect(uploaded.status).toBe(201)
    const body = (await uploaded.json()) as {
      file: { id: string; dataBase64: string }
      ref: { userId: string }
    }
    expect(body.file.dataBase64).toBe("aGVsbG8=")

    const list = await fetch("/api/media?kind=profile_photo")
    expect(list.status).toBe(200)
    const listed = (await list.json()) as {
      items: Array<{ file: { id: string } }>
    }
    expect(listed.items.some((it) => it.file.id === body.file.id)).toBe(true)

    const one = await fetch(`/api/media/${body.file.id}`)
    expect(one.status).toBe(200)
  })
})
