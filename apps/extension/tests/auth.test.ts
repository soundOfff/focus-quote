import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Effect, Layer } from "effect"
import { AuthService } from "@/services/auth"
import { StorageService } from "@/services/storage"
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from "@/shared/auth-storage"
import type { User } from "@focus-quote/shared"
import { resetChromeStorage } from "./setup"

const TestLayer = AuthService.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(StorageService.Default),
)

const sampleUser: User = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  image: null,
}

const seedAuth = () =>
  new Promise<void>((res) =>
    chrome.storage.local.set(
      { [AUTH_TOKEN_KEY]: "tok-seed", [AUTH_USER_KEY]: sampleUser },
      res,
    ),
  )

describe("AuthService", () => {
  beforeEach(resetChromeStorage)
  afterEach(() => vi.restoreAllMocks())

  describe("currentUser", () => {
    it("returns null when no user is stored", async () => {
      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        return yield* auth.currentUser
      }).pipe(Effect.provide(TestLayer))

      expect(await Effect.runPromise(program)).toBeNull()
    })

    it("returns the user previously stored in chrome.storage", async () => {
      await seedAuth()

      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        return yield* auth.currentUser
      }).pipe(Effect.provide(TestLayer))

      const user = await Effect.runPromise(program)
      expect(user?.id).toBe("user-1")
      expect(user?.email).toBe("test@example.com")
    })
  })

  describe("signOut", () => {
    it("clears token and user from storage after a successful server call", async () => {
      await seedAuth()
      vi.stubGlobal("fetch", async () => new Response(null, { status: 200 }))

      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        yield* auth.signOut
        return yield* auth.currentUser
      }).pipe(Effect.provide(TestLayer))

      expect(await Effect.runPromise(program)).toBeNull()
    })

    it("still clears local storage even if the server call fails (offline-tolerant)", async () => {
      await seedAuth()
      vi.stubGlobal("fetch", async () => {
        throw new Error("network down")
      })

      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        yield* auth.signOut
        return yield* auth.currentUser
      }).pipe(Effect.provide(TestLayer))

      // Must not throw; server failure is best-effort
      expect(await Effect.runPromise(program)).toBeNull()
    })

    it("leaves storage clean even when it was already empty", async () => {
      vi.stubGlobal("fetch", async () => new Response(null, { status: 200 }))

      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        yield* auth.signOut
        return yield* auth.currentUser
      }).pipe(Effect.provide(TestLayer))

      expect(await Effect.runPromise(program)).toBeNull()
    })
  })

  describe("fetchSessionAndPersist", () => {
    const makeSessionResponse = (user: User, token: string) =>
      new Response(JSON.stringify({ user, session: { id: "s1" } }), {
        status: 200,
        headers: {
          "set-auth-token": token,
          "Content-Type": "application/json",
        },
      })

    it("stores the bearer token and user from a successful session response", async () => {
      vi.stubGlobal("fetch", async () => makeSessionResponse(sampleUser, "bearer-xyz"))

      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        const returned = yield* auth.fetchSessionAndPersist
        const stored = yield* auth.currentUser
        return { returned, stored }
      }).pipe(Effect.provide(TestLayer))

      const r = await Effect.runPromise(program)
      expect(r.returned.id).toBe("user-1")
      expect(r.stored?.id).toBe("user-1")
    })

    it("exposes the bearer token so subsequent API calls can use it", async () => {
      vi.stubGlobal("fetch", async () => makeSessionResponse(sampleUser, "bearer-xyz"))

      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        yield* auth.fetchSessionAndPersist
        const storage = yield* StorageService
        return yield* storage.get<string>(AUTH_TOKEN_KEY)
      }).pipe(Effect.provide(TestLayer))

      expect(await Effect.runPromise(program)).toBe("bearer-xyz")
    })

    it("fails with AuthError when the server returns a non-ok status", async () => {
      vi.stubGlobal("fetch", async () => new Response("Unauthorized", { status: 401 }))

      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        return yield* auth.fetchSessionAndPersist.pipe(Effect.either)
      }).pipe(Effect.provide(TestLayer))

      const r = await Effect.runPromise(program)
      expect(r._tag).toBe("Left")
      if (r._tag === "Left") {
        expect(r.left._tag).toBe("AuthError")
        expect(r.left.message).toContain("401")
      }
    })

    it("fails with AuthError when the response body has no user", async () => {
      vi.stubGlobal(
        "fetch",
        async () =>
          new Response(JSON.stringify({ user: null, session: null }), {
            status: 200,
            headers: {
              "set-auth-token": "tok",
              "Content-Type": "application/json",
            },
          }),
      )

      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        return yield* auth.fetchSessionAndPersist.pipe(Effect.either)
      }).pipe(Effect.provide(TestLayer))

      const r = await Effect.runPromise(program)
      expect(r._tag).toBe("Left")
      if (r._tag === "Left") {
        expect(r.left._tag).toBe("AuthError")
      }
    })

    it("fails with AuthError when the response has no bearer token header", async () => {
      vi.stubGlobal(
        "fetch",
        async () =>
          new Response(JSON.stringify({ user: sampleUser, session: {} }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
            // set-auth-token intentionally omitted
          }),
      )

      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        return yield* auth.fetchSessionAndPersist.pipe(Effect.either)
      }).pipe(Effect.provide(TestLayer))

      const r = await Effect.runPromise(program)
      expect(r._tag).toBe("Left")
      if (r._tag === "Left") {
        expect(r.left._tag).toBe("AuthError")
        expect(r.left.message).toMatch(/bearer/i)
      }
    })

    it("fails with AuthError when the network is unreachable", async () => {
      vi.stubGlobal("fetch", async () => {
        throw new TypeError("Failed to fetch")
      })

      const program = Effect.gen(function* () {
        const auth = yield* AuthService
        return yield* auth.fetchSessionAndPersist.pipe(Effect.either)
      }).pipe(Effect.provide(TestLayer))

      const r = await Effect.runPromise(program)
      expect(r._tag).toBe("Left")
      if (r._tag === "Left") {
        expect(r.left._tag).toBe("AuthError")
      }
    })
  })
})
