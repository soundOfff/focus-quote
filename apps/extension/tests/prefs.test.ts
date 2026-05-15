import { beforeEach, describe, expect, it, vi } from "vitest"
import { Effect, Layer } from "effect"
import { StorageService } from "@/services/storage"
import { ApiService } from "@/services/api"
import {
  PREFS_KEY,
  defaultPrefs,
  ensurePrefsMigrated,
  loadPrefs,
  pullPrefsFromRemote,
  pushPrefsToRemote,
  savePrefs,
  type Prefs,
} from "@/shared/prefs"
import { REMOTE_MIGRATION_FLAGS } from "@/shared/remote-migration"
import { resetChromeStorage } from "./setup"

describe("prefs", () => {
  beforeEach(resetChromeStorage)

  it("fills new translation defaults for legacy records", async () => {
    const program = Effect.gen(function* () {
      const storage = yield* StorageService
      yield* storage.set(PREFS_KEY, {
        theme: "light",
        defaultDurationMinutes: 30,
        defaultBreakMinutes: 10,
      })
      return yield* loadPrefs(storage)
    }).pipe(Effect.provide(StorageService.Default))

    const prefs = await Effect.runPromise(program)
    expect(prefs.theme).toBe("dark")
    expect(prefs.defaultDurationMinutes).toBe(30)
    expect(prefs.defaultBreakMinutes).toBe(10)
    expect(prefs.translateFromLang).toBe("auto")
    expect(prefs.translateToLang).toBe("en")
  })

  it("normalizes invalid translation values on save", async () => {
    const unsafe = {
      ...defaultPrefs,
      translateFromLang: "bad-lang",
      translateToLang: "not-real",
    } as unknown as Prefs

    const program = Effect.gen(function* () {
      const storage = yield* StorageService
      yield* savePrefs(storage, unsafe)
      return yield* loadPrefs(storage)
    }).pipe(Effect.provide(StorageService.Default))

    const prefs = await Effect.runPromise(program)
    expect(prefs.translateFromLang).toBe("auto")
    expect(prefs.translateToLang).toBe("en")
  })

  it("pulls remote settings into the local cache", async () => {
    const fakeApi = {
      getSettings: () =>
        Effect.succeed({
          settings: {
            theme: "light" as const,
            defaultDurationMinutes: 50,
            defaultBreakMinutes: 12,
            translateFromLang: "auto",
            translateToLang: "es",
            todayGoal: "ship",
            debugOverlayEnabled: false,
            notificationsBlocked: false,
            toolbarSide: "left" as const,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
    }
    const TestLayer = Layer.merge(
      StorageService.Default,
      Layer.succeed(ApiService, fakeApi as unknown as ApiService),
    )
    const program = Effect.gen(function* () {
      const storage = yield* StorageService
      return yield* pullPrefsFromRemote(storage)
    }).pipe(Effect.provide(TestLayer))

    const prefs = await Effect.runPromise(program)
    expect(prefs.theme).toBe("light")
    expect(prefs.defaultDurationMinutes).toBe(50)
    expect(prefs.translateToLang).toBe("es")
  })

  it("falls back to local prefs when remote read fails", async () => {
    const fakeApi = { getSettings: () => Effect.fail(new Error("network")) }
    const TestLayer = Layer.merge(
      StorageService.Default,
      Layer.succeed(ApiService, fakeApi as unknown as ApiService),
    )
    const program = Effect.gen(function* () {
      const storage = yield* StorageService
      yield* savePrefs(storage, {
        ...defaultPrefs,
        defaultDurationMinutes: 17,
      })
      return yield* pullPrefsFromRemote(storage)
    }).pipe(Effect.provide(TestLayer))

    const prefs = await Effect.runPromise(program)
    expect(prefs.defaultDurationMinutes).toBe(17)
  })

  it("ensurePrefsMigrated uploads once and sets the flag", async () => {
    const putSettings = vi.fn((_body: unknown) =>
      Effect.succeed({ settings: {} as never }),
    )
    const fakeApi = { putSettings }
    const TestLayer = Layer.merge(
      StorageService.Default,
      Layer.succeed(ApiService, fakeApi as unknown as ApiService),
    )
    const program = Effect.gen(function* () {
      const storage = yield* StorageService
      yield* savePrefs(storage, defaultPrefs)
      yield* ensurePrefsMigrated(storage)
      // Second call must short-circuit because the flag was set.
      yield* ensurePrefsMigrated(storage)
      return yield* storage.get<boolean>(REMOTE_MIGRATION_FLAGS.prefs)
    }).pipe(Effect.provide(TestLayer))

    const flag = await Effect.runPromise(program)
    expect(flag).toBe(true)
    expect(putSettings).toHaveBeenCalledTimes(1)
  })

  it("pushPrefsToRemote serializes optional extras", async () => {
    const putSettings = vi.fn((_body: unknown) =>
      Effect.succeed({ settings: {} as never }),
    )
    const fakeApi = { putSettings }
    const TestLayer = Layer.merge(
      StorageService.Default,
      Layer.succeed(ApiService, fakeApi as unknown as ApiService),
    )
    const program = pushPrefsToRemote(defaultPrefs, {
      todayGoal: "ship staging",
      debugOverlayEnabled: true,
      notificationsBlocked: true,
      toolbarSide: "left",
    }).pipe(Effect.provide(TestLayer))

    await Effect.runPromise(program)
    expect(putSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        todayGoal: "ship staging",
        debugOverlayEnabled: true,
        notificationsBlocked: true,
        toolbarSide: "left",
      }),
    )
  })
})
