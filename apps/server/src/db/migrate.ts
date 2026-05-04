import { migrate } from "drizzle-orm/libsql/migrator"
import { db, libsql } from "./client"

await migrate(db, { migrationsFolder: "./drizzle" })
console.log("[migrate] complete")
libsql.close()
process.exit(0)
