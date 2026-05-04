import { describe, it, expect, beforeEach } from "vitest"
import { Effect, Layer } from "effect"
import { SyncService } from "@/services/sync"
import { StorageService } from "@/services/storage"
import { ApiService } from "@/services/api"
import { NetworkError } from "@/shared/errors"
import type { QuoteId } from "@focus-quote/shared"
import { resetChromeStorage } from "./setup"

let calls = 0
let mode: "ok" | "fail-all" | "fail-second" = "ok"

const TestApi = Layer.succeed(ApiService, {
  // Only the methods used by SyncService.drain need to be implemented.
  syncBatch: ({ jobs }: { jobs: ReadonlyArray<unknown> }) => {
    calls++
    if (mode === "fail-all") {
      return Effect.fail(new NetworkError({ message: "down" }))
    }
    return Effect.succeed({
      results: jobs.map((_, i) => {
        if (mode === "fail-second" && i === 1) {
          return { ok: false as const, error: "boom" }
        }
        return { ok: true as const }
      }),
    })
  },
} as unknown as ApiService)

const TestLayer = SyncService.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(Layer.merge(StorageService.Default, TestApi)),
)

const sampleJob = (id: string) => ({
  kind: "upsertQuote" as const,
  id: id as QuoteId,
  text: "hello",
  sourceUrl: null,
  sourceTitle: null,
  tag: null,
  createdAt: "2026-05-04T00:00:00Z",
  updatedAt: "2026-05-04T00:00:00Z",
})

describe("SyncService", () => {
  beforeEach(() => {
    resetChromeStorage()
    calls = 0
    mode = "ok"
  })

  it("enqueues jobs and reports queue size", async () => {
    const program = Effect.gen(function* () {
      const sync = yield* SyncService
      yield* sync.enqueue(sampleJob("q1"))
      yield* sync.enqueue({ kind: "deleteQuote", id: "q1" as QuoteId })
      return yield* sync.queueSize
    }).pipe(Effect.provide(TestLayer))

    expect(await Effect.runPromise(program)).toBe(2)
  })

  it("drains the queue when API succeeds", async () => {
    const program = Effect.gen(function* () {
      const sync = yield* SyncService
      yield* sync.enqueue(sampleJob("q1"))
      yield* sync.enqueue(sampleJob("q2"))
      const result = yield* sync.drain
      const remaining = yield* sync.queueSize
      return { result, remaining }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.result.applied).toBe(2)
    expect(r.result.failed).toBe(0)
    expect(r.remaining).toBe(0)
    expect(calls).toBe(1)
  })

  it("keeps everything queued when the whole batch fails", async () => {
    mode = "fail-all"
    const program = Effect.gen(function* () {
      const sync = yield* SyncService
      yield* sync.enqueue(sampleJob("q1"))
      yield* sync.enqueue(sampleJob("q2"))
      const result = yield* sync.drain
      const remaining = yield* sync.queueSize
      return { result, remaining }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.result.applied).toBe(0)
    expect(r.result.failed).toBe(2)
    expect(r.remaining).toBe(2)
  })

  it("keeps individual failed items in the queue, drops successes", async () => {
    mode = "fail-second"
    const program = Effect.gen(function* () {
      const sync = yield* SyncService
      yield* sync.enqueue(sampleJob("q1"))
      yield* sync.enqueue(sampleJob("q2"))
      yield* sync.enqueue(sampleJob("q3"))
      const result = yield* sync.drain
      const remaining = yield* sync.queueSize
      return { result, remaining }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.result.applied).toBe(2)
    expect(r.result.failed).toBe(1)
    expect(r.remaining).toBe(1)
  })
})
