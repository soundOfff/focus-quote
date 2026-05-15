import { Effect } from "effect"
import type { StorageService } from "../services/storage"

/**
 * One-time migration flags. We migrate locally-stored state to the server
 * the first time the user is signed in on a given device; the flag prevents
 * us from re-uploading stale local snapshots on every load.
 */
export const REMOTE_MIGRATION_FLAGS = {
  prefs: "focusquote.remoteMigrated.prefs.v1",
  privacy: "focusquote.remoteMigrated.privacy.v1",
  profile: "focusquote.remoteMigrated.profile.v1",
  openrouter: "focusquote.remoteMigrated.openrouter.v1",
  toolbarState: "focusquote.remoteMigrated.toolbarState.v1",
} as const

export type RemoteMigrationFlag =
  (typeof REMOTE_MIGRATION_FLAGS)[keyof typeof REMOTE_MIGRATION_FLAGS]

export const isMigrated = (
  storage: StorageService,
  flag: RemoteMigrationFlag,
): Effect.Effect<boolean> =>
  storage.get<boolean>(flag).pipe(
    Effect.map((v) => v === true),
    Effect.catchAll(() => Effect.succeed(false)),
  )

export const markMigrated = (
  storage: StorageService,
  flag: RemoteMigrationFlag,
): Effect.Effect<void> =>
  storage.set(flag, true).pipe(Effect.catchAll(() => Effect.void))
