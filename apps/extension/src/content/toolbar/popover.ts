import { tokens } from "./tokens"
import { icons } from "./icons"
import type { ToolbarShell, ToolbarSide } from "./shell"

/**
 * Lightweight popover panel anchored next to a toolbar button. We use a
 * single, swappable popover layer (only one open at a time) instead of one
 * panel per feature so dismissal behavior is uniform.
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
  /** Title shown in the popover header. */
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
    "min-width:260px",
    "max-width:340px",
    `background:${tokens.navy}`,
    `border:1px solid ${tokens.tealDim}`,
    `border-radius:${tokens.radiusMd}`,
    `color:${tokens.ink}`,
    `font:${tokens.font}`,
    `z-index:${tokens.zPopover}`,
    "box-shadow:none",
    "display:flex",
    "flex-direction:column",
    "pointer-events:auto",
    "overflow:hidden",
  ].join(";")

  const header = document.createElement("div")
  header.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    `gap:${tokens.space.sm}`,
    `padding:${tokens.space.sm} ${tokens.space.md}`,
    `border-bottom:1px solid ${tokens.hairline}`,
    "font-size:12px",
    "letter-spacing:0.04em",
    "text-transform:uppercase",
    `color:${tokens.inkMute}`,
  ].join(";")
  const title = document.createElement("span")
  title.textContent = opts.title
  const closeBtn = document.createElement("button")
  closeBtn.type = "button"
  closeBtn.setAttribute("aria-label", "Close")
  closeBtn.style.cssText = [
    "all:unset",
    "cursor:pointer",
    `color:${tokens.inkMute}`,
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:20px",
    "height:20px",
    `border-radius:${tokens.radius}`,
  ].join(";")
  closeBtn.innerHTML = icons.x(tokens.icon.sm - 2)
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.backgroundColor = tokens.hairline
    closeBtn.style.color = tokens.ink
  })
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.backgroundColor = "transparent"
    closeBtn.style.color = tokens.inkMute
  })
  header.append(title, closeBtn)
  panel.appendChild(header)

  const body = document.createElement("div")
  body.setAttribute("data-role", "body")
  body.style.cssText = `padding:${tokens.space.md};display:flex;flex-direction:column;gap:${tokens.space.sm}`
  if (opts.body !== undefined) {
    if (typeof opts.body === "string") body.textContent = opts.body
    else body.appendChild(opts.body)
  }
  panel.appendChild(body)
  ;(document.documentElement || document.body).appendChild(panel)

  const position = (side: ToolbarSide) => {
    const r = opts.anchor()
    const margin = 8
    const edge = 8
    const measured = panel.getBoundingClientRect()
    // Vertically align the popover's top edge with the button's top edge,
    // then clamp into the viewport so it never overflows the screen.
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
  // Re-run after the first frame so the panel's measured size is final.
  requestAnimationFrame(() => position(opts.shell.getSide()))

  let unsubSide: (() => void) | null = opts.shell.onSideChange((s) =>
    position(s),
  )
  const onResize = () => position(opts.shell.getSide())
  window.addEventListener("resize", onResize, { passive: true })

  const onDocPointerDown = (e: MouseEvent) => {
    // Click inside popover, the anchor button, or the toolbar itself: keep
    // the popover open and let the underlying handler run. Otherwise close.
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
    if (openHandle?.el === panel) openHandle = null
    opts.onClose?.()
  }
  closeBtn.addEventListener("click", close)

  openHandle = { el: panel, close }

  const handle: PopoverHandle = {
    setBody(node) {
      body.replaceChildren()
      if (typeof node === "string") body.textContent = node
      else body.appendChild(node)
      requestAnimationFrame(() => position(opts.shell.getSide()))
    },
    close,
    body,
  }
  return handle
}

/**
 * Convenience: a styled in-popover button matching the design system.
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
    `gap:${tokens.space.xs}`,
    `padding:${tokens.space.sm} ${tokens.space.md}`,
    `border-radius:${tokens.radius}`,
    "font-weight:600",
    "font-size:12px",
    "cursor:pointer",
    "min-height:28px",
    "transition:background-color 120ms ease",
    isPrimary
      ? `background:${tokens.accent};color:#fff`
      : `background:transparent;color:${tokens.ink};border:1px solid ${tokens.hairline}`,
  ].join(";")
  return btn
}

/**
 * Convenience: a styled text input matching the design system.
 */
export const popoverInput = (placeholder = ""): HTMLInputElement => {
  const input = document.createElement("input")
  input.type = "text"
  input.placeholder = placeholder
  input.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "width:100%",
    `padding:${tokens.space.sm} ${tokens.space.md}`,
    `background:${tokens.navyDeep}`,
    `border:1px solid ${tokens.hairline}`,
    `border-radius:${tokens.radius}`,
    `color:${tokens.ink}`,
    "font-size:13px",
  ].join(";")
  input.addEventListener("focus", () => {
    input.style.borderColor = tokens.tealDim
  })
  input.addEventListener("blur", () => {
    input.style.borderColor = tokens.hairline
  })
  return input
}
