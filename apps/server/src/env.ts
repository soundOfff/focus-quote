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

  // LLM provider selection. If unset, auto: prefers Anthropic when both keys
  // are present. Set explicitly to "openrouter" to force OpenRouter even if
  // ANTHROPIC_API_KEY is also defined.
  LLM_PROVIDER: z.enum(["anthropic", "openrouter"]).optional(),

  // Anthropic (server-side AI analysis of session URLs)
  ANTHROPIC_API_KEY: z.string().optional(),

  // OpenRouter (OpenAI-compatible gateway, supports free models for testing).
  // Model defaults to a free Llama instruct model; override with OPENROUTER_MODEL.
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z
    .string()
    .min(1)
    .default("google/gemini-2.0-flash-001"),

  // Symmetric key (base64) used to encrypt user-provided secrets at rest in
  // the `user_secrets` table. Must be 32 raw bytes (`openssl rand -base64 32`).
  // Optional in dev/test — when unset, secrets endpoints reject writes.
  SECRETS_ENCRYPTION_KEY: z.string().optional(),
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
