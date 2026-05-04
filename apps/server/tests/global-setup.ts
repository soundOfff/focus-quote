import { existsSync, unlinkSync } from "node:fs"

const DB_FILE = "./test.db"

export default function globalSetup() {
  // Run before any test module imports the libSQL client (singleton).
  if (existsSync(DB_FILE)) unlinkSync(DB_FILE)
  return () => {
    // teardown: remove the test DB so a fresh run gets a clean slate
    if (existsSync(DB_FILE)) unlinkSync(DB_FILE)
  }
}
