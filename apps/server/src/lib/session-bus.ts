/**
 * In-process pub/sub keyed by sessionId. The session-urls route publishes
 * AI classification + nudge events; the SSE route subscribes per connection.
 * Process-local — fine for single-instance dev/MVP.
 */

import type { SessionStreamEvent } from "@focus-quote/shared"

type Subscriber = (event: SessionStreamEvent) => void

const subs = new Map<string, Set<Subscriber>>()

export const subscribe = (sessionId: string, fn: Subscriber): (() => void) => {
  let set = subs.get(sessionId)
  if (!set) {
    set = new Set()
    subs.set(sessionId, set)
  }
  set.add(fn)
  return () => {
    const s = subs.get(sessionId)
    if (!s) return
    s.delete(fn)
    if (s.size === 0) subs.delete(sessionId)
  }
}

export const publish = (
  sessionId: string,
  event: SessionStreamEvent,
): void => {
  const set = subs.get(sessionId)
  if (!set) return
  for (const fn of set) {
    try {
      fn(event)
    } catch (err) {
      console.warn("[session-bus] subscriber threw:", err)
    }
  }
}

export const hasSubscribers = (sessionId: string): boolean =>
  (subs.get(sessionId)?.size ?? 0) > 0
