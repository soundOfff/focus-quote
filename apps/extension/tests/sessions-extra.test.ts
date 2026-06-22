/**
 * Additional SessionsService coverage beyond sessions.test.ts:
 *   - list() overlays server-generated titles onto local sessions
 *   - list() gracefully degrades when the server is offline
 *   - list() honours an optional limit
 *   - streak logic: cancelled sessions do not count
 *   - multiple completions in one day = one streak day
 *   - complete() returns null for unknown session id
 *   - complete() sets endedAt
 */

import { describe, it, expect, beforeEach } from "vitest"
import { Effect, Layer } from "effect"
import { SessionsService } from "@/services/sessions"
import { StorageService } from "@/services/storage"
import { SyncService } from "@/services/sync"
import { ApiService } from "@/services/api"
import { NetworkError } from "@/shared/errors"
import type { Session, SessionId, TopicId } from "@focus-quote/shared"
import { resetChromeStorage } from "./setup"

const TOPIC = "topic-1" as TopicId

const buildLayer = (listSessionsOverride?: () => Effect.Effect<{ sessions: ReadonlyArray<Session> }, unknown>) => {
  const TestApi = Layer.succeed(ApiService, {
    syncBatch: ({ jobs }: { jobs: ReadonlyArray<unknown> }) =>
      Effect.succeed({ results: jobs.map(() => ({ ok: true as const })) }),
    listSessions: listSessionsOverride ?? (() => Effect.succeed({ sessions: [] as ReadonlyArray<Session> })),
  } as unknown as ApiService)
  const baseDeps = Layer.merge(StorageService.Default, TestApi)
  const syncStack = SyncService.DefaultWithoutDependencies.pipe(
    Layer.provideMerge(baseDeps),
  )
  return SessionsService.DefaultWithoutDependencies.pipe(
    Layer.provideMerge(syncStack),
  )
}

const startInput = (goal = "study session") => ({
  goal,
  topicId: TOPIC,
  durationMinutes: 25,
  breakMinutes: 5,
})

describe("SessionsService (extended)", () => {
  beforeEach(resetChromeStorage)

  describe("list()", () => {
    it("returns an empty array when no sessions have been created", async () => {
      const program = Effect.gen(function* () {
        const sessions = yield* SessionsService
        return yield* sessions.list()
      }).pipe(Effect.provide(buildLayer()))

      expect(await Effect.runPromise(program)).toHaveLength(0)
    })

    it("overlays server-generated titles onto locally stored sessions", async () => {
      let sessionId = ""

      // Create a session using the plain layer first
      const setup = Effect.gen(function* () {
        const sessions = yield* SessionsService
        const { session } = yield* sessions.start(startInput("learn TypeScript"))
        sessionId = session.id
      }).pipe(Effect.provide(buildLayer()))

      await Effect.runPromise(setup)

      // Build a layer whose listSessions returns a server title for that session id
      const TestLayer = buildLayer(() =>
        Effect.succeed({
          sessions: [
            {
              id: sessionId as SessionId,
              goal: "learn TypeScript",
              topicId: TOPIC,
              durationMinutes: 25,
              breakMinutes: 5,
              completed: false,
              startedAt: new Date().toISOString(),
              endedAt: null,
              title: "TypeScript Mastery Session",
            },
          ] as ReadonlyArray<Session>,
        }),
      )

      const program = Effect.gen(function* () {
        const sessions = yield* SessionsService
        return yield* sessions.list()
      }).pipe(Effect.provide(TestLayer))

      const listed = await Effect.runPromise(program)
      expect(listed).toHaveLength(1)
      expect((listed[0] as Session & { title?: string }).title).toBe(
        "TypeScript Mastery Session",
      )
    })

    it("falls back gracefully when the server is offline (returns local data unchanged)", async () => {
      const TestLayer = buildLayer(() =>
        Effect.fail(new NetworkError({ message: "server down" })),
      )

      const program = Effect.gen(function* () {
        const sessions = yield* SessionsService
        yield* sessions.start(startInput("offline session"))
        return yield* sessions.list()
      }).pipe(Effect.provide(TestLayer))

      const listed = await Effect.runPromise(program)
      expect(listed).toHaveLength(1)
      expect(listed[0]!.goal).toBe("offline session")
    })

    it("respects the limit argument", async () => {
      const program = Effect.gen(function* () {
        const sessions = yield* SessionsService
        for (let i = 0; i < 5; i++) {
          yield* sessions.start(startInput(`session ${i}`))
        }
        return yield* sessions.list(3)
      }).pipe(Effect.provide(buildLayer()))

      const listed = await Effect.runPromise(program)
      expect(listed).toHaveLength(3)
    })
  })

  describe("stats / streak logic", () => {
    it("cancelled sessions do not count toward today's streak or todayCount", async () => {
      const program = Effect.gen(function* () {
        const sessions = yield* SessionsService
        yield* sessions.start(startInput())
        yield* sessions.cancel
        return yield* sessions.stats
      }).pipe(Effect.provide(buildLayer()))

      const stats = await Effect.runPromise(program)
      expect(stats.todayCount).toBe(0)
      expect(stats.streakDays).toBe(0)
      expect(stats.totalCompleted).toBe(0)
    })

    it("multiple completions in one day count individually but form only one streak day", async () => {
      const program = Effect.gen(function* () {
        const sessions = yield* SessionsService
        const { session: s1 } = yield* sessions.start(startInput("first"))
        yield* sessions.complete(s1.id, true)
        const { session: s2 } = yield* sessions.start(startInput("second"))
        yield* sessions.complete(s2.id, true)
        return yield* sessions.stats
      }).pipe(Effect.provide(buildLayer()))

      const stats = await Effect.runPromise(program)
      expect(stats.todayCount).toBe(2)
      expect(stats.streakDays).toBe(1)
      expect(stats.totalCompleted).toBe(2)
    })

    it("complete(id, false) does not count toward stats", async () => {
      const program = Effect.gen(function* () {
        const sessions = yield* SessionsService
        const { session } = yield* sessions.start(startInput())
        yield* sessions.complete(session.id, false)
        return yield* sessions.stats
      }).pipe(Effect.provide(buildLayer()))

      const stats = await Effect.runPromise(program)
      expect(stats.todayCount).toBe(0)
      expect(stats.totalCompleted).toBe(0)
    })
  })

  describe("complete()", () => {
    it("returns null when the given session id does not exist", async () => {
      const program = Effect.gen(function* () {
        const sessions = yield* SessionsService
        return yield* sessions.complete("non-existent" as SessionId, true)
      }).pipe(Effect.provide(buildLayer()))

      expect(await Effect.runPromise(program)).toBeNull()
    })

    it("sets endedAt to a time at or after the session started", async () => {
      const before = new Date()

      const program = Effect.gen(function* () {
        const sessions = yield* SessionsService
        const { session } = yield* sessions.start(startInput())
        return yield* sessions.complete(session.id, true)
      }).pipe(Effect.provide(buildLayer()))

      const completed = await Effect.runPromise(program)
      expect(completed?.endedAt).toBeTruthy()
      expect(new Date(completed!.endedAt!).getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      )
    })

    it("clears the active session after completion", async () => {
      const program = Effect.gen(function* () {
        const sessions = yield* SessionsService
        const { session } = yield* sessions.start(startInput())
        yield* sessions.complete(session.id, true)
        return yield* sessions.getActive
      }).pipe(Effect.provide(buildLayer()))

      expect(await Effect.runPromise(program)).toBeNull()
    })
  })
})
