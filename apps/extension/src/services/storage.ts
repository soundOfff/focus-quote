import { Effect } from "effect"
import { StorageError } from "../shared/errors"

const wrapLastError = (op: string) =>
  new StorageError({
    message: chrome.runtime.lastError?.message ?? `${op} failed`,
  })

export class StorageService extends Effect.Service<StorageService>()(
  "StorageService",
  {
    sync: () => ({
      get: <T>(key: string): Effect.Effect<T | null, StorageError> =>
        Effect.async<T | null, StorageError>((resume) => {
          chrome.storage.local.get(key, (got: Record<string, unknown>) => {
            if (chrome.runtime.lastError) {
              resume(Effect.fail(wrapLastError("storage.get")))
              return
            }
            resume(Effect.succeed((got[key] ?? null) as T | null))
          })
        }),

      set: <T>(key: string, value: T): Effect.Effect<void, StorageError> =>
        Effect.async<void, StorageError>((resume) => {
          chrome.storage.local.set({ [key]: value }, () => {
            if (chrome.runtime.lastError) {
              resume(Effect.fail(wrapLastError("storage.set")))
              return
            }
            resume(Effect.void)
          })
        }),

      remove: (key: string): Effect.Effect<void, StorageError> =>
        Effect.async<void, StorageError>((resume) => {
          chrome.storage.local.remove(key, () => {
            if (chrome.runtime.lastError) {
              resume(Effect.fail(wrapLastError("storage.remove")))
              return
            }
            resume(Effect.void)
          })
        }),
    }),
  },
) {}
