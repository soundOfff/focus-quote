import { describe, it, expect, beforeEach } from "vitest"
import { Effect, Layer } from "effect"
import { UrlTrackerService } from "@/services/urlTracker"
import { StorageService } from "@/services/storage"
import { SyncService } from "@/services/sync"
import { ApiService } from "@/services/api"
import { NetworkError } from "@/shared/errors"
import { AUTH_TOKEN_KEY } from "@/shared/auth-storage"
import { PRIVACY_KEY } from "@/shared/privacy"
import { resetChromeStorage } from "./setup"

const seedAuthToken = () =>
  new Promise<void>((res) => chrome.storage.local.set({ [AUTH_TOKEN_KEY]: "tok" }, res))

const setPrivacy = (trackUrls: boolean, blocklist: string[] = []) =>
  new Promise<void>((res) =>
    chrome.storage.local.set({ [PRIVACY_KEY]: { trackUrls, blocklist } }, res),
  )

const sampleInput = (
  overrides: Partial<{
    sessionId: string
    url: string
    hostname: string
    title: string | null
    content: string | null
  }> = {},
) => ({
  sessionId: "session-1",
  url: "https://example.com/page",
  hostname: "example.com",
  title: "Example Page",
  content: null,
  ...overrides,
})

describe("UrlTrackerService", () => {
  let postSessionUrlsCalls = 0
  let postSessionUrlsMode: "ok" | "fail" = "ok"
  let lastPostedUrls: unknown[] = []

  const makeTestApi = () =>
    Layer.succeed(ApiService, {
      syncBatch: ({ jobs }: { jobs: ReadonlyArray<unknown> }) =>
        Effect.succeed({ results: jobs.map(() => ({ ok: true as const })) }),
      postSessionUrls: ({ urls }: { urls: unknown[] }) => {
        postSessionUrlsCalls++
        lastPostedUrls = urls
        if (postSessionUrlsMode === "fail")
          return Effect.fail(new NetworkError({ message: "down" }))
        return Effect.succeed({ count: urls.length })
      },
    } as unknown as ApiService)

  const buildLayer = () => {
    const TestApi = makeTestApi()
    const baseDeps = Layer.merge(StorageService.Default, TestApi)
    const syncStack = SyncService.DefaultWithoutDependencies.pipe(
      Layer.provideMerge(baseDeps),
    )
    return UrlTrackerService.DefaultWithoutDependencies.pipe(
      Layer.provideMerge(syncStack),
    )
  }

  beforeEach(async () => {
    resetChromeStorage()
    await seedAuthToken()
    postSessionUrlsCalls = 0
    postSessionUrlsMode = "ok"
    lastPostedUrls = []
  })

  it("does not buffer when trackUrls is off (default privacy)", async () => {
    // Default privacy has trackUrls: false — no storage seeded
    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput())
      return yield* tracker.flush
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.posted).toBe(0)
    expect(r.queued).toBe(0)
    expect(postSessionUrlsCalls).toBe(0)
  })

  it("buffers and posts a URL visit when trackUrls is on", async () => {
    await setPrivacy(true)

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput())
      return yield* tracker.flush
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.posted).toBe(1)
    expect(r.queued).toBe(0)
    expect(postSessionUrlsCalls).toBe(1)
  })

  it("deduplicates: same URL is not buffered again after a flush", async () => {
    await setPrivacy(true)

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput())
      const firstFlush = yield* tracker.flush
      // Visit same URL again after the buffer was cleared by flush
      yield* tracker.record(sampleInput())
      const secondFlush = yield* tracker.flush
      return { firstFlush, secondFlush }
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.firstFlush.posted).toBe(1)
    expect(r.secondFlush.posted).toBe(0) // dedupe ledger prevents re-send
    expect(postSessionUrlsCalls).toBe(1)
  })

  it("allows a content-bearing visit to upgrade a prior content-less capture", async () => {
    await setPrivacy(true)

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput({ content: null }))
      const firstFlush = yield* tracker.flush
      // Same URL but now with content — should pass through to upgrade the record
      yield* tracker.record(sampleInput({ content: "article text here" }))
      const secondFlush = yield* tracker.flush
      return { firstFlush, secondFlush }
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.firstFlush.posted).toBe(1)
    expect(r.secondFlush.posted).toBe(1)
    expect(postSessionUrlsCalls).toBe(2)
  })

  it("does not allow a second content-bearing visit (already upgraded)", async () => {
    await setPrivacy(true)

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput({ content: "first content" }))
      yield* tracker.flush
      yield* tracker.record(sampleInput({ content: "second content" }))
      return yield* tracker.flush
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.posted).toBe(0) // already has content → deduped
    expect(postSessionUrlsCalls).toBe(1)
  })

  it("skips URLs whose hostname matches the blocklist exactly", async () => {
    await setPrivacy(true, ["blocked.com"])

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput({ hostname: "blocked.com" }))
      return yield* tracker.flush
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.posted).toBe(0)
    expect(postSessionUrlsCalls).toBe(0)
  })

  it("skips subdomains of a blocklisted hostname", async () => {
    await setPrivacy(true, ["blocked.com"])

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput({ hostname: "www.blocked.com" }))
      yield* tracker.record(sampleInput({ url: "https://sub.blocked.com", hostname: "sub.blocked.com" }))
      return yield* tracker.flush
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.posted).toBe(0)
    expect(postSessionUrlsCalls).toBe(0)
  })

  it("does not block non-matching hostnames even with a populated blocklist", async () => {
    await setPrivacy(true, ["blocked.com"])

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput({ hostname: "allowed.com", url: "https://allowed.com/page" }))
      return yield* tracker.flush
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.posted).toBe(1)
  })

  it("on API failure, queues URLs to SyncService and clears the local buffer", async () => {
    await setPrivacy(true)
    postSessionUrlsMode = "fail"

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      const sync = yield* SyncService
      yield* tracker.record(sampleInput({ url: "https://a.com", hostname: "a.com" }))
      yield* tracker.record(
        sampleInput({ url: "https://b.com", hostname: "b.com", sessionId: "session-2" }),
      )
      const result = yield* tracker.flush
      const queueSize = yield* sync.queueSize
      return { result, queueSize }
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.result.posted).toBe(0)
    expect(r.result.queued).toBe(2)
    expect(r.queueSize).toBe(2) // SyncService has the fallback jobs
  })

  it("flush is a no-op when the buffer is empty", async () => {
    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      return yield* tracker.flush
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.posted).toBe(0)
    expect(r.queued).toBe(0)
    expect(postSessionUrlsCalls).toBe(0)
  })

  it("clear wipes the buffer and the dedup ledger so the same URL can be re-buffered", async () => {
    await setPrivacy(true)

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput())
      yield* tracker.flush // send + dedupe ledger now has the URL
      yield* tracker.clear // wipe everything
      yield* tracker.record(sampleInput()) // should be bufferable again
      return yield* tracker.flush
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.posted).toBe(1)
    expect(postSessionUrlsCalls).toBe(2)
  })

  it("truncates page content to 4000 characters before buffering", async () => {
    await setPrivacy(true)

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput({ content: "x".repeat(5000) }))
      return yield* tracker.flush
    }).pipe(Effect.provide(buildLayer()))

    await Effect.runPromise(program)
    const entry = lastPostedUrls[0] as { content?: string }
    expect(entry?.content?.length).toBe(4000)
  })

  it("batches multiple different URLs in a single flush call", async () => {
    await setPrivacy(true)

    const program = Effect.gen(function* () {
      const tracker = yield* UrlTrackerService
      yield* tracker.record(sampleInput({ url: "https://a.com/1", hostname: "a.com" }))
      yield* tracker.record(
        sampleInput({ url: "https://b.com/2", hostname: "b.com", sessionId: "s2" }),
      )
      yield* tracker.record(
        sampleInput({ url: "https://c.com/3", hostname: "c.com", sessionId: "s3" }),
      )
      return yield* tracker.flush
    }).pipe(Effect.provide(buildLayer()))

    const r = await Effect.runPromise(program)
    expect(r.posted).toBe(3)
    expect(postSessionUrlsCalls).toBe(1) // single batch call
  })
})
