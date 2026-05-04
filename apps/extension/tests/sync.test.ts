import { describe, it, expect, beforeEach } from "vitest"
import { Effect, Layer } from "effect"
import { SyncService } from "@/services/sync"
import { StorageService } from "@/services/storage"
import { DatabaseService } from "@/services/database"
import { DatabaseError } from "@/shared/errors"
import type { Quote } from "@/shared/schema"
import { resetChromeStorage } from "./setup"

let executeCalls = 0
let executeShouldFail = false

const fakeResultSet = {
  rows: [],
  columns: [],
  columnTypes: [],
  rowsAffected: 1,
  lastInsertRowid: undefined,
  toJSON: () => ({}),
}

const TestDatabase = Layer.succeed(DatabaseService, {
  isReady: () => true,
  ensureSchema: Effect.void,
  ping: Effect.succeed(true),
  execute: () => {
    executeCalls++
    return executeShouldFail
      ? Effect.fail(new DatabaseError({ message: "boom" }))
      : Effect.succeed(fakeResultSet as never)
  },
} as unknown as DatabaseService)

const TestLayer = SyncService.DefaultWithoutDependencies.pipe(
  Layer.provide(Layer.merge(StorageService.Default, TestDatabase)),
)

const sampleQuote: Quote = {
  id: "q1" as Quote["id"],
  deviceId: "d1" as Quote["deviceId"],
  text: "hello world",
  sourceUrl: "https://example.com",
  sourceTitle: "Example",
  tag: null,
  createdAt: "2026-05-04T00:00:00Z",
  updatedAt: "2026-05-04T00:00:00Z",
}

describe("SyncService", () => {
  beforeEach(() => {
    resetChromeStorage()
    executeCalls = 0
    executeShouldFail = false
  })

  it("enqueues jobs and reports queue size", async () => {
    const program = Effect.gen(function* () {
      const sync = yield* SyncService
      yield* sync.enqueue({ kind: "upsertQuote", quote: sampleQuote })
      yield* sync.enqueue({
        kind: "deleteQuote",
        id: "q1" as Quote["id"],
        deviceId: "d1" as Quote["deviceId"],
      })
      return yield* sync.queueSize
    }).pipe(Effect.provide(TestLayer))

    expect(await Effect.runPromise(program)).toBe(2)
  })

  it("drains the queue when DB succeeds", async () => {
    const program = Effect.gen(function* () {
      const sync = yield* SyncService
      yield* sync.enqueue({ kind: "upsertQuote", quote: sampleQuote })
      const result = yield* sync.drain
      const remaining = yield* sync.queueSize
      return { result, remaining }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.result.applied).toBe(1)
    expect(r.result.failed).toBe(0)
    expect(r.remaining).toBe(0)
    expect(executeCalls).toBe(1)
  })

  it("keeps failing jobs in the queue", async () => {
    executeShouldFail = true
    const program = Effect.gen(function* () {
      const sync = yield* SyncService
      yield* sync.enqueue({ kind: "upsertQuote", quote: sampleQuote })
      const result = yield* sync.drain
      const remaining = yield* sync.queueSize
      return { result, remaining }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.result.applied).toBe(0)
    expect(r.result.failed).toBe(1)
    expect(r.remaining).toBe(1)
  })

  it("recovers a previously-failed job on next drain", async () => {
    const program = Effect.gen(function* () {
      const sync = yield* SyncService
      yield* sync.enqueue({ kind: "upsertQuote", quote: sampleQuote })

      executeShouldFail = true
      yield* sync.drain
      const stillQueued = yield* sync.queueSize

      executeShouldFail = false
      const final = yield* sync.drain
      const remaining = yield* sync.queueSize
      return { stillQueued, final, remaining }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.stillQueued).toBe(1)
    expect(r.final.applied).toBe(1)
    expect(r.remaining).toBe(0)
  })
})
