import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { saveVaultItem } from "../lib/vault"

// General "quick save to vault" used by surfaces that aren't tied to a specific
// topic up-front: the annotation tool and the right-click-image context menu.
// With a valid sessionId the item is session-scoped (pending until the session
// resolves a topic); without one it lands in "Uncategorized".
const SaveVaultItemInput = z.object({
  sessionId: z.string().min(1).max(120).nullable().optional(),
  kind: z.enum(["note", "url", "image"]),
  body: z.string().min(1).max(2000),
  title: z.string().max(200).nullable().optional(),
  mediaFileId: z.string().min(1).max(120).nullable().optional(),
})

export const vaultRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .post("/save", zValidator("json", SaveVaultItemInput), async (c) => {
    const userId = c.get("user").id
    const input = c.req.valid("json")
    const item = await saveVaultItem(userId, {
      sessionId: input.sessionId ?? null,
      kind: input.kind,
      body: input.body,
      title: input.title ?? null,
      mediaFileId: input.mediaFileId ?? null,
    })
    return c.json({ item }, 201)
  })
