import { describe, it, expect, vi } from "vitest"
import { attachCurrentPageToVault } from "@/content/toolbar/vault-link"

const makeDeps = (over: Partial<Parameters<typeof attachCurrentPageToVault>[0]> = {}) => {
  const notify = vi.fn()
  const post = vi.fn(async () => ({ item: { id: "v1" } }))
  return {
    notify,
    post,
    getSessionId: () => "sess-1",
    getPage: () => ({ url: "https://example.com/article", title: "An Article" }),
    ...over,
  }
}

describe("attachCurrentPageToVault", () => {
  it("does not call the API and reports no-session when there is no active session", async () => {
    const deps = makeDeps({ getSessionId: () => null })
    const result = await attachCurrentPageToVault(deps)
    expect(result.status).toBe("no-session")
    expect(deps.post).not.toHaveBeenCalled()
    expect(deps.notify).toHaveBeenCalledWith(expect.any(String), "error")
  })

  it("posts the current page to the active session's vault-link endpoint", async () => {
    const deps = makeDeps()
    const result = await attachCurrentPageToVault(deps)
    expect(result.status).toBe("saved")
    expect(deps.post).toHaveBeenCalledWith(
      "/api/focus-sessions/sess-1/vault-link",
      { url: "https://example.com/article", title: "An Article" },
    )
    expect(deps.notify).toHaveBeenCalledWith(expect.any(String))
  })

  it("reports an error (without throwing) when the API call fails", async () => {
    const deps = makeDeps({
      post: vi.fn(async () => {
        throw new Error("network down")
      }),
    })
    const result = await attachCurrentPageToVault(deps)
    expect(result.status).toBe("error")
    expect(deps.notify).toHaveBeenCalledWith(expect.any(String), "error")
  })
})
