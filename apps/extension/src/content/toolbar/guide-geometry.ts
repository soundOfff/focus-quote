/**
 * Pure geometry / matching helpers for the Guide Me ghost cursor.
 *
 * Kept free of DOM access so they can be unit-tested in the (node) test env —
 * the same split used by `popover-position.ts`. The DOM-walking capture lives in
 * `page-context.ts`; the imperative playback lives in `guide.ts`.
 */

export interface ViewportSize {
  w: number
  h: number
}

export interface PxPoint {
  x: number
  y: number
}

/** Minimal subset of DOMRect we need — lets tests pass plain objects. */
export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Resolve a guide step to an absolute viewport point in CSS pixels.
 *
 * Prefers the live element's measured rect (so the cursor lands on the REAL
 * control wherever it currently is). Falls back to the step's stored normalized
 * coordinates — which the server derived from the real element at capture time,
 * but can be stale after a reload or layout change.
 */
export const resolveGuidePoint = (
  step: { x: number; y: number },
  liveRect: RectLike | null,
  viewport: ViewportSize,
): PxPoint => {
  if (liveRect && liveRect.width > 0 && liveRect.height > 0) {
    return {
      x: Math.round(liveRect.left + liveRect.width / 2),
      y: Math.round(liveRect.top + liveRect.height / 2),
    }
  }
  return {
    x: Math.round(step.x * viewport.w),
    y: Math.round(step.y * viewport.h),
  }
}

/** Significant lowercase tokens from a goal, used for relevance ranking. */
export const goalTokens = (goal: string): string[] =>
  goal
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 2)

/**
 * Rank candidate elements so the ones whose label shares a word with the goal
 * come first, then truncate to `max`. Stable: document order is preserved within
 * each group. This keeps the element the user actually asked about from being
 * dropped by the cap on dense pages, where naive document-order truncation would
 * lose it behind a wall of nav chrome.
 */
export const rankCandidates = <T extends { label: string }>(
  items: readonly T[],
  goal: string,
  max: number,
): T[] => {
  const tokens = goalTokens(goal)
  if (tokens.length === 0) return items.slice(0, max)
  const matched: T[] = []
  const rest: T[] = []
  for (const it of items) {
    const label = it.label.toLowerCase()
    ;(tokens.some((t) => label.includes(t)) ? matched : rest).push(it)
  }
  return [...matched, ...rest].slice(0, max)
}

/**
 * Heuristic used on resume-after-reload (when the original live elements are
 * gone) to re-acquire an element for a step: does this label correspond to the
 * action the step describes? Requires a label of length >= 2 to avoid trivial
 * matches like a single-character button.
 */
export const labelMatchesStep = (
  label: string,
  step: { instruction: string; description: string },
): boolean => {
  const l = label.trim().toLowerCase()
  if (l.length < 2) return false
  const hay = `${step.instruction} ${step.description}`.toLowerCase()
  return hay.includes(l)
}
