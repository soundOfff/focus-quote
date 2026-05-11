import { z } from "zod"

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  // libSQL / Turso (or local file)
  DATABASE_URL: z.string().min(1).default("file:./data.db"),
  DATABASE_AUTH_TOKEN: z.string().optional(),

  // Better Auth core
  BETTER_AUTH_SECRET: z
    .string()
    .min(1, "BETTER_AUTH_SECRET is required (e.g. `openssl rand -base64 32`)"),
  BETTER_AUTH_URL: z
    .string()
    .url()
    .default("http://localhost:3000"),

  // CORS / trusted origin for the extension
  EXTENSION_ORIGIN: z.string().min(1).default("chrome-extension://INVALID"),

  // OAuth (optional in dev)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Email (optional in dev — falls back to stdout)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),

  // Anthropic (server-side AI analysis of session URLs)
  ANTHROPIC_API_KEY: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error("[server] invalid environment:")
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`)
  }
  process.exit(1)
}

export const env: Env = parsed.data
