import { tokens } from "./tokens"
import { icons } from "./icons"
import type { ToolbarShell, ToolbarSide } from "./shell"

/**
 * Lightweight popover panel anchored next to a toolbar button. Single,
 * swappable popover layer (only one open at a time) keeps dismissal
 * behavior uniform across features.
 *
 * Direction A chrome:
 *   - Outer panel: paper bg, popup-border, 12px radius, shadowPanel
 *   - Header: paper-2 fill, mono kicker with amber dot, close X right
 *   - Body: paper bg, padding owned by the feature (we don't pad here so
 *     the quote+AI "passage card" can bleed to the panel's edges)
 */

export interface PopoverHandle {
  /** Replace popover content (header is kept). */
  setBody: (node: Node | string) => void
  /** Close + detach listeners. */
  close: () => void
  /** Underlying body container — features render into this. */
  body: HTMLDivElement
}

interface OpenOptions {
  /** Title shown in the popover header (rendered uppercase, mono). */
  title: string
  /** Anchor button rect — popover positions next to it. */
  anchor: () => DOMRect
  /** Reflow when window is resized or toolbar side flips. */
  shell: ToolbarShell
  /** Initial body content; can also be set later via `setBody`. */
  body?: Node | string
  /** Fired when the popover closes for any reason. */
  onClose?: () => void
  /** Whether clicks outside should dismiss this popover. Default true. */
  dismissOnOutsideClick?: boolean
}

const POPOVER_ATTR = "data-focusquote-popover"

let openHandle: { el: HTMLDivElement; close: () => void } | null = null

type StateListener = (open: boolean) => void
const stateListeners = new Set<StateListener>()
const notifyState = () => {
  for (const cb of stateListeners) cb(openHandle !== null)
}

export const isPopoverOpen = (): boolean => openHandle !== null

export const subscribePopoverState = (cb: StateListener): (() => void) => {
  stateListeners.add(cb)
  return () => stateListeners.delete(cb)
}

export const closeOpenPopover = (): void => {
  if (openHandle) openHandle.close()
}

export const openPopover = (opts: OpenOptions): PopoverHandle => {
  // Single-popover policy: opening a new one tears the old one down first.
  closeOpenPopover()

  const panel = document.createElement("div")
  panel.setAttribute(POPOVER_ATTR, "")
  panel.style.cssText = [
    "position:fixed",
    "width:320px",
    `background:${tokens.paper}`,
    `border:1px solid ${tokens.popupBorder}`,
    `border-radius:${tokens.radiusLg}`,
    `color:${tokens.ink}`,
    `font:${tokens.font}`,
    `z-index:${tokens.zPopover}`,
    `box-shadow:${tokens.shadowPanel}`,
    "display:flex",
    "flex-direction:column",
    "pointer-events:auto",
    "overflow:hidden",
  ].join(";")

  // -- Header: paper-2 band with mono kicker + amber dot + close X --------
  const header = document.createElement("div")
  header.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "padding:10px 12px 10px 14px",
    `border-bottom:1px solid ${tokens.rule}`,
    `background:${tokens.paper2}`,
  ].join(";")

  const kicker = document.createElement("div")
  kicker.style.cssText = [
    `font:${tokens.fontMono}`,
    "font-size:10px",
    "font-weight:600",
    "letter-spacing:0.12em",
    "text-transform:uppercase",
    `color:${tokens.amberDeep}`,
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
  ].join(";")
  const dot = document.createElement("span")
  dot.style.cssText = `width:5px;height:5px;border-radius:${tokens.radiusPill};background:${tokens.amber}`
  const kickerText = document.createElement("span")
  kickerText.textContent = opts.title
  kicker.append(dot, kickerText)

  const closeBtn = document.createElement("button")
  closeBtn.type = "button"
  closeBtn.setAttribute("aria-label", "Close")
  closeBtn.style.cssText = [
    "all:unset",
    "cursor:pointer",
    `color:${tokens.muted}`,
    "display:grid",
    "place-items:center",
    "width:22px",
    "height:22px",
    "border-radius:5px",
    "transition:background-color 120ms ease,color 120ms ease",
  ].join(";")
  closeBtn.innerHTML = icons.x(12)
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.backgroundColor = tokens.paper
    closeBtn.style.color = tokens.ink2
  })
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.backgroundColor = "transparent"
    closeBtn.style.color = tokens.muted
  })
  header.append(kicker, closeBtn)
  panel.appendChild(header)

  // -- Body: feature owns its padding so cards / composers can fan to the
  // -- panel edges without an outer gutter.
  const body = document.createElement("div")
  body.setAttribute("data-role", "body")
  body.style.cssText =
    "display:flex;flex-direction:column;gap:0;background:" + tokens.paper
  if (opts.body !== undefined) {
    if (typeof opts.body === "string") {
      // Plain text bodies still get a reasonable default gutter.
      body.style.padding = "12px 14px"
      body.textContent = opts.body
    } else {
      body.appendChild(opts.body)
    }
  }
  panel.appendChild(body)
  ;(document.documentElement || document.body).appendChild(panel)

  const position = (side: ToolbarSide) => {
    const r = opts.anchor()
    const margin = 8
    const edge = 8
    const measured = panel.getBoundingClientRect()
    const top = Math.max(
      edge,
      Math.min(window.innerHeight - measured.height - edge, r.top),
    )
    panel.style.top = `${top}px`
    if (side === "right") {
      panel.style.right = `${window.innerWidth - r.left + margin}px`
      panel.style.left = "auto"
    } else {
      panel.style.left = `${r.right + margin}px`
      panel.style.right = "auto"
    }
  }
  position(opts.shell.getSide())
  requestAnimationFrame(() => position(opts.shell.getSide()))

  let unsubSide: (() => void) | null = opts.shell.onSideChange((s) =>
    position(s),
  )
  const onResize = () => position(opts.shell.getSide())
  window.addEventListener("resize", onResize, { passive: true })

  const onDocPointerDown = (e: MouseEvent) => {
    const target = e.target as Node | null
    if (panel.contains(target)) return
    if (opts.shell.el.contains(target)) return
    handle.close()
  }
  const dismissOnOutsideClick = opts.dismissOnOutsideClick ?? true
  if (dismissOnOutsideClick) {
    document.addEventListener("mousedown", onDocPointerDown, true)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") handle.close()
  }
  document.addEventListener("keydown", onKey)

  const close = () => {
    if (!panel.isConnected) return
    if (dismissOnOutsideClick) {
      document.removeEventListener("mousedown", onDocPointerDown, true)
    }
    document.removeEventListener("keydown", onKey)
    window.removeEventListener("resize", onResize)
    unsubSide?.()
    unsubSide = null
    panel.remove()
    if (openHandle?.el === panel) {
      openHandle = null
      notifyState()
    }
    opts.onClose?.()
  }
  closeBtn.addEventListener("click", close)

  openHandle = { el: panel, close }
  notifyState()

  const handle: PopoverHandle = {
    setBody(node) {
      body.replaceChildren()
      body.style.padding = ""
      if (typeof node === "string") {
        body.style.padding = "12px 14px"
        body.textContent = node
      } else {
        body.appendChild(node)
      }
      requestAnimationFrame(() => position(opts.shell.getSide()))
    },
    close,
    body,
  }
  return handle
}

/**
 * Mono small-caps label. Use anywhere the design system asks for a "kicker"
 * — section header, badge, meta line. Caller controls color via inline
 * style or sets it on the returned element.
 */
export const popoverMonoLabel = (text: string): HTMLSpanElement => {
  const el = document.createElement("span")
  el.style.cssText = [
    `font:${tokens.fontMono}`,
    "font-size:9.5px",
    "font-weight:500",
    "letter-spacing:0.12em",
    "text-transform:uppercase",
    `color:${tokens.muted}`,
  ].join(";")
  el.textContent = text
  return el
}

/**
 * Direction A panel button. Primary = the amber gradient pill (one per
 * surface); ghost = paper-2 + rule + ink-2.
 */
export const popoverButton = (
  label: string,
  variant: "primary" | "ghost" = "primary",
): HTMLButtonElement => {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.textContent = label
  const isPrimary = variant === "primary"
  btn.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "gap:6px",
    "padding:6px 11px",
    `border-radius:${tokens.radius}`,
    "font-weight:600",
    "font-size:12px",
    "letter-spacing:-0.005em",
    "cursor:pointer",
    "white-space:nowrap",
    "transition:filter 120ms ease,background-color 120ms ease,border-color 120ms ease",
    isPrimary
      ? `background:${tokens.amberGradient};color:#2A1A05;border:1px solid ${tokens.amberDeep};box-shadow:${tokens.shadowAmber}`
      : `background:${tokens.paper2};color:${tokens.ink2};border:1px solid ${tokens.rule}`,
  ].join(";")
  if (isPrimary) {
    btn.addEventListener("mouseenter", () => {
      btn.style.filter = "brightness(1.03)"
    })
    btn.addEventListener("mouseleave", () => {
      btn.style.filter = "none"
    })
  } else {
    btn.addEventListener("mouseenter", () => {
      btn.style.backgroundColor = tokens.paper
    })
    btn.addEventListener("mouseleave", () => {
      btn.style.backgroundColor = tokens.paper2
    })
  }
  return btn
}

/**
 * Bare text input — matches the composer's inline input (no border on its
 * own; the composer shell wraps it). Pass `paper` if you want a standalone
 * field (used by the in-popover prompt before the chat opens).
 */
export const popoverInput = (placeholder = ""): HTMLInputElement => {
  const input = document.createElement("input")
  input.type = "text"
  input.placeholder = placeholder
  input.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "width:100%",
    "padding:8px 10px",
    `background:${tokens.paper}`,
    `border:1px solid ${tokens.rule}`,
    `border-radius:9px`,
    `color:${tokens.ink}`,
    "font-size:12.5px",
  ].join(";")
  input.addEventListener("focus", () => {
    input.style.borderColor = tokens.amberDeep
    input.style.boxShadow = "0 0 0 3px rgba(242,160,60,0.15)"
  })
  input.addEventListener("blur", () => {
    input.style.borderColor = tokens.rule
    input.style.boxShadow = "none"
  })
  return input
}

export interface ComposerOptions {
  placeholder: string
  buttonLabel: string
  /** Right-hand mono hint, e.g. `"⌘ ↵"` or `"↵"`. */
  hint: string
  onSubmit: (value: string) => void
}

export interface ComposerHandle {
  root: HTMLDivElement
  input: HTMLInputElement
  button: HTMLButtonElement
  setBusy: (busy: boolean) => void
  focus: () => void
}

/**
 * Footer composer used by the Quote+AI and Guide panels. Lives inside a
 * paper-2 band that's stuck to the bottom of the panel; the inner shell
 * is a paper card holding the input, mono hint, and the single amber
 * action.
 */
export const popoverComposer = (opts: ComposerOptions): ComposerHandle => {
  const root = document.createElement("div")
  root.style.cssText = [
    "padding:10px 12px 12px",
    `border-top:1px solid ${tokens.rule}`,
    `background:${tokens.paper2}`,
    "margin-top:12px",
  ].join(";")

  const inner = document.createElement("div")
  inner.style.cssText = [
    `background:${tokens.paper}`,
    `border:1px solid ${tokens.rule}`,
    "border-radius:9px",
    "padding:8px 8px 8px 11px",
    "display:flex",
    "align-items:center",
    "gap:8px",
    "transition:border-color 120ms ease,box-shadow 120ms ease",
  ].join(";")

  const input = document.createElement("input")
  input.type = "text"
  input.placeholder = opts.placeholder
  input.style.cssText = [
    "all:unset",
    "flex:1",
    "min-width:0",
    `color:${tokens.ink}`,
    "font-size:12.5px",
  ].join(";")
  input.addEventListener("focus", () => {
    inner.style.borderColor = tokens.amberDeep
    inner.style.boxShadow = "0 0 0 3px rgba(242,160,60,0.15)"
  })
  input.addEventListener("blur", () => {
    inner.style.borderColor = tokens.rule
    inner.style.boxShadow = "none"
  })

  const hint = document.createElement("span")
  hint.style.cssText = [
    `font:${tokens.fontMono}`,
    "font-size:9px",
    `color:${tokens.muted2}`,
    "letter-spacing:0.04em",
  ].join(";")
  hint.textContent = opts.hint

  const button = popoverButton(opts.buttonLabel, "primary")

  const submit = () => {
    const value = input.value.trim()
    if (button.getAttribute("data-busy") === "true") return
    opts.onSubmit(value)
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      submit()
    }
  })
  button.addEventListener("click", submit)

  inner.append(input, hint, button)
  root.appendChild(inner)

  return {
    root,
    input,
    button,
    setBusy(busy) {
      button.setAttribute("data-busy", String(busy))
      button.style.opacity = busy ? "0.65" : "1"
      button.style.pointerEvents = busy ? "none" : "auto"
    },
    focus() {
      input.focus()
    },
  }
}
