import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../db/client"
import { userSecrets } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { PutSecretInput, SecretKindInput } from "../lib/api-schemas"
import {
  encryptSecret,
  isSecretsKeyConfigured,
  maskSecretHint,
} from "../lib/secret-crypto"

type SecretRow = typeof userSecrets.$inferSelect

const toSummary = (kind: SecretKindInput, row: SecretRow | null) => ({
  kind,
  hasValue: !!row,
  hint: row?.hint ?? null,
  updatedAt: row?.updatedAt ?? null,
})

const findSecret = async (
  userId: string,
  kind: SecretKindInput,
): Promise<SecretRow | null> => {
  const [row] = await db
    .select()
    .from(userSecrets)
    .where(and(eq(userSecrets.userId, userId), eq(userSecrets.kind, kind)))
    .limit(1)
  return row ?? null
}

export const secretsRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/:kind", async (c) => {
    const userId = c.get("user").id
    const parsed = SecretKindInput.safeParse(c.req.param("kind"))
    if (!parsed.success) {
      return c.json({ error: "Unknown secret kind", code: "BAD_REQUEST" }, 400)
    }
    const row = await findSecret(userId, parsed.data)
    return c.json({ secret: toSummary(parsed.data, row) })
  })
  .put("/:kind", zValidator("json", PutSecretInput), async (c) => {
    const userId = c.get("user").id
    const parsed = SecretKindInput.safeParse(c.req.param("kind"))
    if (!parsed.success) {
      return c.json({ error: "Unknown secret kind", code: "BAD_REQUEST" }, 400)
    }
    if (!isSecretsKeyConfigured()) {
      return c.json(
        {
          error: "SECRETS_ENCRYPTION_KEY not configured on server",
          code: "SECRETS_DISABLED",
        },
        503,
      )
    }
    const { value } = c.req.valid("json")
    const encrypted = encryptSecret(value)
    const hint = maskSecretHint(value)
    const now = new Date().toISOString()
    const existing = await findSecret(userId, parsed.data)
    if (existing) {
      await db
        .update(userSecrets)
        .set({ encryptedValue: encrypted, hint, updatedAt: now })
        .where(eq(userSecrets.id, existing.id))
    } else {
      await db.insert(userSecrets).values({
        id: randomUUID(),
        userId,
        kind: parsed.data,
        encryptedValue: encrypted,
        hint,
        updatedAt: now,
      })
    }
    const row = await findSecret(userId, parsed.data)
    return c.json({ secret: toSummary(parsed.data, row) })
  })
  .delete("/:kind", async (c) => {
    const userId = c.get("user").id
    const parsed = SecretKindInput.safeParse(c.req.param("kind"))
    if (!parsed.success) {
      return c.json({ error: "Unknown secret kind", code: "BAD_REQUEST" }, 400)
    }
    await db
      .delete(userSecrets)
      .where(
        and(eq(userSecrets.userId, userId), eq(userSecrets.kind, parsed.data)),
      )
    return c.json({ ok: true as const })
  })
