import { Hono } from "hono"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { consolidateGraph, loadTagGraph } from "../lib/tags"

// ADR 0003: the extension keeps a synced read-model of the AI-maintained Tag
// graph so the tree renders offline. Graph *mutations* arrive through the
// offline sync queue (see routes/sync.ts); these two endpoints expose the
// read-model and the manual Consolidation ("Tidy now") pass.
export const tagsRoutes = new Hono<{ Variables: RequireUserVariables }>()
  .use("*", requireUser)
  .get("/graph", async (c) => {
    const userId = c.get("user").id
    const graph = await loadTagGraph(userId)
    return c.json(graph)
  })
  .post("/consolidate", async (c) => {
    const userId = c.get("user").id
    const changes = await consolidateGraph(userId)
    return c.json({ ok: true, changes })
  })
