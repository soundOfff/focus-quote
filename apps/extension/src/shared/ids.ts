import { Effect } from "effect"
import { StorageError } from "./errors"
import type { DeviceId } from "./schema"

const DEVICE_ID_KEY = "focusquote.deviceId"

/**
 * Reads the device_id from chrome.storage.local, or generates and persists
 * one on first run. The id partitions a user's rows in the shared Turso DB.
 */
export const getOrCreateDeviceId: Effect.Effect<DeviceId, StorageError> =
  Effect.async<DeviceId, StorageError>((resume) => {
    chrome.storage.local.get(DEVICE_ID_KEY, (got) => {
      if (chrome.runtime.lastError) {
        resume(
          Effect.fail(
            new StorageError({
              message: chrome.runtime.lastError.message ?? "storage.get failed",
            }),
          ),
        )
        return
      }
      const existing = got[DEVICE_ID_KEY] as string | undefined
      if (existing) {
        resume(Effect.succeed(existing as DeviceId))
        return
      }
      const fresh = crypto.randomUUID() as DeviceId
      chrome.storage.local.set({ [DEVICE_ID_KEY]: fresh }, () => {
        if (chrome.runtime.lastError) {
          resume(
            Effect.fail(
              new StorageError({
                message:
                  chrome.runtime.lastError.message ?? "storage.set failed",
              }),
            ),
          )
          return
        }
        resume(Effect.succeed(fresh))
      })
    })
  })
