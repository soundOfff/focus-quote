/**
 * Tracks which in-page tools are currently "active" — popovers open
 * (Quote+AI, Guide Me), the annotate overlay, etc. The save-quote
 * selection bar (in `content.ts`) subscribes to this so it can hide
 * while the user is using a different tool.
 */

import { subscribePopoverState, isPopoverOpen } from "./popover"

let annotateActive = false

type Listener = (anyActive: boolean) => void
const listeners = new Set<Listener>()

const notify = () => {
  const active = isAnyToolActive()
  for (const cb of listeners) cb(active)
}

export const setAnnotateActive = (active: boolean): void => {
  if (annotateActive === active) return
  annotateActive = active
  notify()
}

export const isAnyToolActive = (): boolean =>
  isPopoverOpen() || annotateActive

export const subscribeToolState = (cb: Listener): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// Forward popover changes through this same channel so subscribers only
// need to listen here.
subscribePopoverState(() => notify())
