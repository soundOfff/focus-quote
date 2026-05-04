import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { env } from "../env"
import * as schema from "./schema"

export const libsql = createClient({
  url: env.DATABASE_URL,
  authToken: env.DATABASE_AUTH_TOKEN,
})

export const db = drizzle(libsql, { schema })
export type DB = typeof db
