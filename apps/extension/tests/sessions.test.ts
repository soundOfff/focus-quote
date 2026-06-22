import { describe, it, expect, beforeEach } from "vitest"
import { Effect, Layer } from "effect"
import { SessionsService } from "@/services/sessions"
import { StorageService } from "@/services/storage"
import { SyncService } from "@/services/sync"
import { ApiService } from "@/services/api"
import type { Session, TopicId } from "@focus-quote/shared"
import { resetChromeStorage } from "./setup"

const TOPIC = "topic-1" as TopicId

const TestApi = Layer.succeed(ApiService, {
  syncBatch: ({ jobs }: { jobs: ReadonlyArray<unknown> }) =>
    Effect.succeed({ results: jobs.map(() => ({ ok: true as const })) }),
  listSessions: () => Effect.succeed({ sessions: [] as ReadonlyArray<Session> }),
} as unknown as ApiService)

const baseDeps = Layer.merge(StorageService.Default, TestApi)
const syncStack = SyncService.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(baseDeps),
)
const TestLayer = SessionsService.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(syncStack),
)

describe("SessionsService", () => {
  beforeEach(resetChromeStorage)

  it("starts a session and tracks it as active", async () => {
    const program = Effect.gen(function* () {
      const sessions = yield* SessionsService
      const { session, active } = yield* sessions.start({
        goal: "ship MVP",
        topicId: TOPIC,
        durationMinutes: 25,
        breakMinutes: 5,
      })
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
      const { session } = yield* sessions.start({
        goal: "read a chapter",
        topicId: TOPIC,
        durationMinutes: 25,
        breakMinutes: 5,
      })
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
      yield* sessions.start({
        goal: "write tests",
        topicId: TOPIC,
        durationMinutes: 25,
        breakMinutes: 5,
      })
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
      const { session } = yield* sessions.start({
        goal: "review PR",
        topicId: TOPIC,
        durationMinutes: 25,
        breakMinutes: 5,
      })
      yield* sessions.complete(session.id, true)
      return yield* sessions.stats
    }).pipe(Effect.provide(TestLayer))

    const r = await Effect.runPromise(program)
    expect(r.todayCount).toBe(1)
    expect(r.streakDays).toBe(1)
    expect(r.totalCompleted).toBe(1)
  })
})
