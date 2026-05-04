import { describe, it, expect, beforeEach } from "vitest"
import { Effect, Layer } from "effect"
import { QuotesService } from "@/services/quotes"
import { StorageService } from "@/services/storage"
import { SyncService } from "@/services/sync"
import { ApiService } from "@/services/api"
import { resetChromeStorage } from "./setup"

const TestApi = Layer.succeed(ApiService, {
  syncBatch: ({ jobs }: { jobs: ReadonlyArray<unknown> }) =>
    Effect.succeed({ results: jobs.map(() => ({ ok: true as const })) }),
} as unknown as ApiService)

const baseDeps = Layer.merge(StorageService.Default, TestApi)
const syncStack = SyncService.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(baseDeps),
)
const TestLayer = QuotesService.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(syncStack),
)

describe("QuotesService", () => {
  beforeEach(resetChromeStorage)

  it("saves and lists a quote", async () => {
    const program = Effect.gen(function* () {
      const quotes = yield* QuotesService
      const saved = yield* quotes.save({
        text: "first quote",
        sourceUrl: "https://example.com",
        sourceTitle: "Example",
        tag: "wisdom",
      })
      const listed = yield* quotes.list()
      return { saved, listed }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.saved.text).toBe("first quote")
    expect(r.listed).toHaveLength(1)
    expect(r.listed[0]!.id).toBe(r.saved.id)
  })

  it("rejects empty text", async () => {
    const program = Effect.gen(function* () {
      const quotes = yield* QuotesService
      return yield* quotes.save({
        text: "",
        sourceUrl: null,
        sourceTitle: null,
        tag: null,
      })
    }).pipe(Effect.provide(TestLayer))

    await expect(Effect.runPromise(program)).rejects.toBeDefined()
  })

  it("searches by text and tag, case-insensitive", async () => {
    const program = Effect.gen(function* () {
      const quotes = yield* QuotesService
      yield* quotes.save({
        text: "Stay hungry",
        sourceUrl: null,
        sourceTitle: null,
        tag: "jobs",
      })
      yield* quotes.save({
        text: "The unexamined life",
        sourceUrl: null,
        sourceTitle: null,
        tag: "philosophy",
      })
      const byText = yield* quotes.search("hungry")
      const byTag = yield* quotes.search("PHILOSOPHY")
      const empty = yield* quotes.search("")
      return { byText, byTag, empty }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.byText).toHaveLength(1)
    expect(r.byText[0]!.text).toMatch(/hungry/i)
    expect(r.byTag).toHaveLength(1)
    expect(r.byTag[0]!.tag).toBe("philosophy")
    expect(r.empty).toHaveLength(2)
  })

  it("removes a quote and enqueues a delete sync job", async () => {
    const program = Effect.gen(function* () {
      const quotes = yield* QuotesService
      const sync = yield* SyncService
      const saved = yield* quotes.save({
        text: "to delete",
        sourceUrl: null,
        sourceTitle: null,
        tag: null,
      })
      const beforeQueueSize = yield* sync.queueSize
      yield* quotes.remove(saved.id)
      const afterList = yield* quotes.list()
      const afterQueueSize = yield* sync.queueSize
      return { beforeQueueSize, afterList, afterQueueSize }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.beforeQueueSize).toBe(1)
    expect(r.afterList).toHaveLength(0)
    expect(r.afterQueueSize).toBe(2) // upsert + delete
  })
})
