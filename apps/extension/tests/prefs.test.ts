import { beforeEach, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { StorageService } from "@/services/storage"
import {
  PREFS_KEY,
  defaultPrefs,
  loadPrefs,
  savePrefs,
  type Prefs,
} from "@/shared/prefs"
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
})
