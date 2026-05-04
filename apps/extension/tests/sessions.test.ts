import { describe, it, expect, beforeEach } from "vitest"
import { Effect, Layer } from "effect"
import { SessionsService } from "@/services/sessions"
import { StorageService } from "@/services/storage"
import { SyncService } from "@/services/sync"
import { DatabaseService } from "@/services/database"
import type { DeviceId } from "@/shared/schema"
import { resetChromeStorage } from "./setup"

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
  execute: () => Effect.succeed(fakeResultSet as never),
} as unknown as DatabaseService)

const baseDeps = Layer.merge(StorageService.Default, TestDatabase)
const syncStack = SyncService.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(baseDeps),
)
const TestLayer = SessionsService.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(syncStack),
)

const deviceId = "device-test-1" as DeviceId

describe("SessionsService", () => {
  beforeEach(resetChromeStorage)

  it("starts a session and tracks it as active", async () => {
    const program = Effect.gen(function* () {
      const sessions = yield* SessionsService
      const { session, active } = yield* sessions.start(
        { goal: "ship MVP", durationMinutes: 25, breakMinutes: 5 },
        deviceId,
      )
      const stored = yield* sessions.getActive
      return { session, active, stored }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.session.completed).toBe(false)
    expect(r.session.goal).toBe("ship MVP")
    expect(r.active.sessionId).toBe(r.session.id)
    expect(r.stored?.sessionId).toBe(r.session.id)
  })

  it("completes a session and clears active", async () => {
    const program = Effect.gen(function* () {
      const sessions = yield* SessionsService
      const { session } = yield* sessions.start(
        { goal: null, durationMinutes: 25, breakMinutes: 5 },
        deviceId,
      )
      const completed = yield* sessions.complete(session.id, true)
      const active = yield* sessions.getActive
      return { completed, active }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.completed?.completed).toBe(true)
    expect(r.completed?.endedAt).toBeTruthy()
    expect(r.active).toBeNull()
  })

  it("cancel marks active session as not completed and clears it", async () => {
    const program = Effect.gen(function* () {
      const sessions = yield* SessionsService
      yield* sessions.start(
        { goal: null, durationMinutes: 25, breakMinutes: 5 },
        deviceId,
      )
      const cancelled = yield* sessions.cancel
      const active = yield* sessions.getActive
      return { cancelled, active }
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.cancelled?.completed).toBe(false)
    expect(r.active).toBeNull()
  })

  it("computes today count and a 1-day streak after one completion", async () => {
    const program = Effect.gen(function* () {
      const sessions = yield* SessionsService
      const { session } = yield* sessions.start(
        { goal: null, durationMinutes: 25, breakMinutes: 5 },
        deviceId,
      )
      yield* sessions.complete(session.id, true)
      return yield* sessions.stats
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.todayCount).toBe(1)
    expect(r.streakDays).toBe(1)
    expect(r.totalCompleted).toBe(1)
  })
})
