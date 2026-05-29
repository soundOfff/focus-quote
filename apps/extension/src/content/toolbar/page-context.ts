import type { GuidePageContext, GuidePageElement } from "@focus-quote/shared"
import { rankCandidates } from "./guide-geometry"

/**
 * Capture a catalog of the page's real interactive elements for Guide Me.
 *
 * The catalog is sent to the server so the model can point each step at an
 * actual control (by `ref`), and the matching live DOM nodes are kept in memory
 * so playback can re-measure each element's current position. This is what makes
 * the ghost cursor land on the real button/menu instead of a generic guess.
 *
 * Privacy: a label is built only from accessible text (aria-label, visible text,
 * placeholder, title, alt). An element's *value* is never read, and password /
 * hidden inputs are skipped entirely — so what the user has typed is never sent.
 *
 * Scope / known limitations (the fixed-position cursor lives in the top frame):
 *  - Open shadow roots ARE traversed (their rects are in the top viewport's
 *    coordinate space, so the cursor can point at them correctly).
 *  - Cross-origin iframes and closed shadow roots are NOT reachable, and
 *    same-origin iframe contents are skipped because their rects live in a
 *    different coordinate space than the top-frame cursor.
 *  - The catalog is a one-shot snapshot: a step whose target only appears after
 *    an earlier action won't have a live element and falls back to an estimate.
 */

const MAX_ELEMENTS = 120
const MAX_LABEL = 120

const SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[role=button]",
  "[role=link]",
  "[role=menuitem]",
  "[role=tab]",
  "[role=checkbox]",
  "[role=switch]",
  "[role=radio]",
  "[role=option]",
  "[onclick]",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  "label",
].join(",")

export interface CapturedPageContext {
  /** Serializable payload for the guide-steps request. */
  context: GuidePageContext
  /** Live element handles, indexed by ref (=== context.elements[i].ref). */
  elements: Element[]
}

const collapse = (s: string | null | undefined): string =>
  (s ?? "").replace(/\s+/g, " ").trim()

/** Skip anything inside FocusQuote's own injected UI (toolbar, popover, cursor,
 *  tooltip, card, capture button …). All our nodes carry a data-focusquote-*
 *  attribute somewhere up the tree. */
const isFocusQuoteOwned = (el: Element): boolean => {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const attrs = node.attributes
    for (let i = 0; i < attrs.length; i++) {
      const name = attrs.item(i)?.name
      if (name && name.startsWith("data-focusquote")) return true
    }
  }
  return false
}

/** Controls that can't be acted on, or whose contents are sensitive. */
const shouldSkip = (el: Element): boolean => {
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase()
    // Never surface password / hidden inputs — and we never read .value anyway.
    if (t === "password" || t === "hidden") return true
  }
  if (
    (el as Partial<HTMLButtonElement>).disabled === true ||
    el.getAttribute("aria-disabled") === "true" ||
    el.getAttribute("aria-hidden") === "true" ||
    el.hasAttribute("hidden")
  ) {
    return true
  }
  return false
}

const isVisible = (el: Element, rect: DOMRect): boolean => {
  if (rect.width < 2 || rect.height < 2) return false
  const cs = window.getComputedStyle(el)
  if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") {
    return false
  }
  return true
}

/** Accessible label, never the element's value. */
const labelFor = (el: Element): string => {
  const aria = collapse(el.getAttribute("aria-label"))
  if (aria) return aria.slice(0, MAX_LABEL)

  const labelledby = el.getAttribute("aria-labelledby")
  if (labelledby) {
    const text = collapse(
      labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" "),
    )
    if (text) return text.slice(0, MAX_LABEL)
  }

  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    const labels = el.labels
    if (labels && labels.length > 0) {
      const t = collapse(Array.from(labels, (l) => l.textContent).join(" "))
      if (t) return t.slice(0, MAX_LABEL)
    }
    const ph = collapse(el.getAttribute("placeholder"))
    if (ph) return ph.slice(0, MAX_LABEL)
  }

  // A contenteditable region's textContent IS the user's typed draft (Gmail
  // compose, the tweet box, Slack/Discord composers …). `isContentEditable` is
  // also true for descendants, so this covers controls nested in an editor too.
  // Never surface that text — fall through to title/alt, else drop the element.
  const isEditable = el instanceof HTMLElement && el.isContentEditable
  if (!isEditable) {
    const text = collapse(el.textContent)
    if (text) return text.slice(0, MAX_LABEL)
  }

  const title = collapse(el.getAttribute("title"))
  if (title) return title.slice(0, MAX_LABEL)

  // Icon-only control wrapping an <img alt="…">.
  const alt = collapse(el.querySelector("img[alt]")?.getAttribute("alt"))
  if (alt) return alt.slice(0, MAX_LABEL)

  return ""
}

const roleFor = (el: Element): string => {
  const explicit = collapse(el.getAttribute("role"))
  if (explicit) return explicit.slice(0, 40)
  if (el instanceof HTMLInputElement) {
    return `input:${(el.type || "text").toLowerCase()}`
  }
  const tag = el.tagName.toLowerCase()
  return tag === "a" ? "link" : tag
}

/** Collect candidate elements from a root, descending into open shadow roots. */
const collect = (root: ParentNode, out: Element[]): void => {
  try {
    for (const el of Array.from(root.querySelectorAll(SELECTOR))) out.push(el)
    for (const el of Array.from(root.querySelectorAll("*"))) {
      const sr = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
      if (sr) collect(sr, out)
    }
  } catch {
    /* querySelectorAll can throw on exotic roots — ignore that subtree */
  }
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

/**
 * Build the page-context payload plus the parallel array of live elements.
 * Never throws — on any failure it returns an empty catalog, and Guide Me
 * gracefully falls back to the server's positional estimates.
 */
export const capturePageContext = (goal: string): CapturedPageContext => {
  const vw = window.innerWidth || 1
  const vh = window.innerHeight || 1
  const empty: CapturedPageContext = {
    context: { title: "", viewport: { w: vw, h: vh }, elements: [] },
    elements: [],
  }

  try {
    const raw: Element[] = []
    collect(document, raw)

    const seen = new Set<Element>()
    type Candidate = { el: Element; label: string; role: string; x: number; y: number }
    const candidates: Candidate[] = []

    for (const el of raw) {
      if (seen.has(el)) continue
      seen.add(el)
      if (isFocusQuoteOwned(el) || shouldSkip(el)) continue
      const rect = el.getBoundingClientRect()
      if (!isVisible(el, rect)) continue
      const label = labelFor(el)
      if (!label) continue
      candidates.push({
        el,
        label,
        role: roleFor(el),
        x: (rect.left + rect.width / 2) / vw,
        y: (rect.top + rect.height / 2) / vh,
      })
    }

    const ranked = rankCandidates(candidates, goal, MAX_ELEMENTS)
    const elements: GuidePageElement[] = []
    const live: Element[] = []
    ranked.forEach((c, i) => {
      elements.push({
        ref: i,
        role: c.role,
        label: c.label,
        x: round3(c.x),
        y: round3(c.y),
      })
      live.push(c.el)
    })

    return {
      context: {
        title: collapse(document.title).slice(0, 300),
        viewport: { w: vw, h: vh },
        elements,
      },
      elements: live,
    }
  } catch {
    return empty
  }
}
