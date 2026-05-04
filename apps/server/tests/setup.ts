import { beforeAll, beforeEach } from "vitest"
import { migrate } from "drizzle-orm/libsql/migrator"
import { db } from "../src/db/client"
import {
  users,
  sessions,
  accounts,
  verifications,
  quotes,
  focusSessions,
} from "../src/db/schema"

// Migrate once per test run. test.db is recreated by the global setup file
// before any module here is imported, so this just applies the schema fresh.
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" })
})

beforeEach(async () => {
  // Wipe rows in dependency order so foreign keys don't complain.
  await db.delete(quotes)
  await db.delete(focusSessions)
  await db.delete(sessions)
  await db.delete(accounts)
  await db.delete(verifications)
  await db.delete(users)
})
