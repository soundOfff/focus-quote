import { createClient, type Client, type InValue, type ResultSet } from "@libsql/client/web"
import { Effect } from "effect"
import { buildConfig, isTursoConfigured } from "../shared/config"
import { DatabaseError } from "../shared/errors"

const SCHEMA_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    device_id TEXT NOT NULL,
    text TEXT NOT NULL,
    source_url TEXT,
    source_title TEXT,
    tag TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    device_id TEXT NOT NULL,
    goal TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 25,
    break_minutes INTEGER NOT NULL DEFAULT 5,
    completed INTEGER NOT NULL DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    device_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (device_id, key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_quotes_device_created ON quotes(device_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_quotes_device_tag ON quotes(device_id, tag)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_device_started ON sessions(device_id, started_at DESC)`,
]

const initClient = (): Client | null => {
  if (!isTursoConfigured()) return null
  try {
    return createClient({
      url: buildConfig.tursoDbUrl,
      authToken: buildConfig.tursoAuthToken,
    })
  } catch (cause) {
    console.warn("[FocusQuote] Turso client init failed:", cause)
    return null
  }
}

export class DatabaseService extends Effect.Service<DatabaseService>()(
  "DatabaseService",
  {
    sync: () => {
      const client = initClient()

      const execute = (
        sql: string,
        args: ReadonlyArray<InValue> = [],
      ): Effect.Effect<ResultSet, DatabaseError> =>
        client === null
          ? Effect.fail(
              new DatabaseError({ message: "Turso client not initialized" }),
            )
          : Effect.tryPromise({
              try: () => client.execute({ sql, args: args as InValue[] }),
              catch: (cause) =>
                new DatabaseError({ message: "execute failed", cause }),
            })

      const ensureSchema: Effect.Effect<void, DatabaseError> = Effect.gen(
        function* () {
          for (const stmt of SCHEMA_STATEMENTS) {
            yield* execute(stmt)
          }
        },
      )

      const ping: Effect.Effect<boolean, DatabaseError> = Effect.gen(
        function* () {
          yield* execute("SELECT 1")
          return true
        },
      )

      return {
        isReady: () => client !== null,
        execute,
        ensureSchema,
        ping,
      }
    },
  },
) {}
