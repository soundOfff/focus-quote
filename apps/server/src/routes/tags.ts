import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { consolidateGraph, loadTagGraph } from "../lib/tags"
import type { ConsolidateProgressEvent } from "@focus-quote/shared"

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
  // Streams the "Tidy now" pass as SSE so the UI can fill a determinate bar:
  // one `classifying`/`filing`/`restructuring` frame per step, then a terminal
  // `done` frame carrying the final change tally. (POST can't use EventSource,
  // so the client reads it with fetch + ReadableStream — see api.ts.)
  .post("/consolidate", async (c) => {
    const userId = c.get("user").id
    return streamSSE(c, async (stream) => {
      // Swallow write errors: if the client disconnects mid-pass we still want
      // the (already side-effecting) consolidation to run to completion — the
      // client just pulls the reshaped graph on its next load.
      const send = (event: ConsolidateProgressEvent) =>
        stream
          .writeSSE({ event: event.phase, data: JSON.stringify(event) })
          .catch(() => {})
      const changes = await consolidateGraph(userId, send)
      await send({ phase: "done", changes })
    })
  })
