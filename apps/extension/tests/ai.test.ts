import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { Effect } from "effect"
import { AIService } from "@/services/ai"
import { OPENROUTER_KEY_KEY } from "@/shared/settings"
import { resetChromeStorage } from "./setup"

const TestLayer = AIService.Default

const seedKey = (value: string) =>
  new Promise<void>((resolve) =>
    chrome.storage.local.set({ [OPENROUTER_KEY_KEY]: value }, resolve),
  )

describe("AIService", () => {
  beforeEach(() => {
    resetChromeStorage()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("isConfigured is false without a key", async () => {
    const program = Effect.gen(function* () {
      const ai = yield* AIService
      return yield* ai.isConfigured
    }).pipe(Effect.provide(TestLayer))
    expect(await Effect.runPromise(program)).toBe(false)
  })

  it("complete fails clearly when no key is set", async () => {
    const program = Effect.gen(function* () {
      const ai = yield* AIService
      return yield* ai.complete("hi").pipe(Effect.either)
    }).pipe(Effect.provide(TestLayer))
    const r = await Effect.runPromise(program)
    expect(r._tag).toBe("Left")
    if (r._tag === "Left") {
      expect(r.left._tag).toBe("AIError")
      expect(r.left.message).toMatch(/key/i)
    }
  })

  it("complete returns content on a successful response", async () => {
    await seedKey("sk-or-test")
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "hello back" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const program = Effect.gen(function* () {
      const ai = yield* AIService
      return yield* ai.complete("hello", { temperature: 0 })
    }).pipe(Effect.provide(TestLayer))

    expect(await Effect.runPromise(program)).toBe("hello back")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toContain("openrouter.ai")
    expect(call[1].headers).toMatchObject({
      Authorization: "Bearer sk-or-test",
    })
  })

  it("retries on a 5xx, then succeeds", async () => {
    await seedKey("sk-or-test")
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls++
      if (calls === 1) {
        return new Response("upstream", { status: 502 })
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    const program = Effect.gen(function* () {
      const ai = yield* AIService
      return yield* ai.complete("retry me")
    }).pipe(Effect.provide(TestLayer))

    expect(await Effect.runPromise(program)).toBe("ok")
    expect(calls).toBeGreaterThanOrEqual(2)
  }, 10_000)
})
