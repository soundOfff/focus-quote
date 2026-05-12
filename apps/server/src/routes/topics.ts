import { Hono } from "hono"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { listTopics } from "../lib/topic"

export const topicsRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("user").id
    const topics = await listTopics(userId)
    return c.json({ topics })
  })
