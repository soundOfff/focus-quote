import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { and, eq } from "drizzle-orm"
import { db } from "../db/client"
import { focusSessions } from "../db/schema"
import {
  requireUser,
  type RequireUserVariables,
} from "../middleware/require-user"
import { subscribe } from "../lib/session-bus"
import type { SessionStreamEvent } from "@focus-quote/shared"

export const streamRoutes = new Hono<{
  Variables: RequireUserVariables,
}>()
  .use("*", requireUser)
  .get("/session/:id", async (c) => {
    const userId = c.get("user").id
    const sessionId = c.req.param("id")

    // Verify the session is owned by the caller.
    const [sess] = await db
      .select({ id: focusSessions.id })
      .from(focusSessions)
      .where(
        and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, userId)),
      )
      .limit(1)
    if (!sess) {
      return c.json({ error: "Session not found", code: "NOT_FOUND" }, 404)
    }

    return streamSSE(c, async (stream) => {
      let eventId = 0
      const queue: SessionStreamEvent[] = []
      let waiter: (() => void) | null = null

      const unsub = subscribe(sessionId, (event) => {
        queue.push(event)
        if (waiter) {
          const w = waiter
          waiter = null
          w()
        }
      })

      // Greet so the client knows the channel is open.
      await stream.writeSSE({
        id: String(eventId++),
        event: "ping",
        data: JSON.stringify({ type: "ping" } satisfies SessionStreamEvent),
      })

      // Keepalive every 20s so MV3 SW doesn't shut idle connection down.
      const keepalive = setInterval(() => {
        queue.push({ type: "ping" })
        if (waiter) {
          const w = waiter
          waiter = null
          w()
        }
      }, 20_000)

      stream.onAbort(() => {
        clearInterval(keepalive)
        unsub()
      })

      try {
        while (!stream.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              waiter = resolve
            })
            continue
          }
          const event = queue.shift()!
          await stream.writeSSE({
            id: String(eventId++),
            event: event.type,
            data: JSON.stringify(event),
          })
        }
      } finally {
        clearInterval(keepalive)
        unsub()
      }
    })
  })
