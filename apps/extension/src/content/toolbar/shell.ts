import { tokens } from "./tokens"
import { icons } from "./icons"

/**
 * Headless floating toolbar shell. Feature modules register buttons via
 * {@link ToolbarShell.addButton}; the shell handles positioning, the
 * left/right side toggle (persisted to localStorage), and global teardown.
 *
 * Visual style follows the FocusQuote design system (deep navy fill, hairline
 * teal border, flat — no shadows). See `apps/DESIGN.MD`.
 */

const SIDE_STORAGE_KEY = "focusquote.toolbar.side"
const ATTR_TOOLBAR = "data-focusquote-toolbar"
const ATTR_BUTTON = "data-focusquote-toolbar-button"

export type ToolbarSide = "left" | "right"

export interface ToolbarButtonHandle {
  /** Replace the button's icon at runtime (e.g. notifications on -> off). */
  setIcon: (svg: string) => void
  /** Toggle a small red badge dot in the top-right corner of the button. */
  setBadge: (visible: boolean) => void
  /** Add / remove the visual "active" treatment. */
  setActive: (active: boolean) => void
  /** Update the accessible label / native tooltip. */
  setLabel: (label: string) => void
  /** Imperatively click the button (used by keyboard shortcuts). */
  click: () => void
  /** Bounding rect of the button — used to anchor popovers. */
  getRect: () => DOMRect
  /** The underlying DOM node. */
  el: HTMLButtonElement
}

export interface ToolbarButtonOptions {
  /** Stable id; allows feature modules to look themselves up later. */
  id: string
  /** Accessible label / native tooltip. */
  label: string
  /** SVG markup (from `icons`). */
  icon: string
  onClick: () => void
}

export interface ToolbarShell {
  /** Container element. */
  el: HTMLDivElement
  /** Append a feature button to the toolbar. */
  addButton: (options: ToolbarButtonOptions) => ToolbarButtonHandle
  /** Look up a previously-added button by id. */
  getButton: (id: string) => ToolbarButtonHandle | null
  /** Current side ("left" | "right"). */
  getSide: () => ToolbarSide
  /** Subscribe to side changes (popovers re-anchor on flip). */
  onSideChange: (cb: (side: ToolbarSide) => void) => () => void
  /** Tear the toolbar down and remove all listeners. */
  destroy: () => void
}

const readSide = (): ToolbarSide => {
  try {
    const v = localStorage.getItem(SIDE_STORAGE_KEY)
    return v === "left" ? "left" : "right"
  } catch {
    return "right"
  }
}

const writeSide = (side: ToolbarSide): void => {
  try {
    localStorage.setItem(SIDE_STORAGE_KEY, side)
  } catch {
    /* private mode etc. — non-fatal */
  }
}

/**
 * Apply side-dependent positioning. We deliberately set `left` *and* `right`
 * (one to a px value, the other to `auto`) so we don't leak stale state when
 * the user flips sides repeatedly.
 */
const applySide = (host: HTMLDivElement, side: ToolbarSide): void => {
  if (side === "right") {
    host.style.right = "16px"
    host.style.left = "auto"
  } else {
    host.style.left = "16px"
    host.style.right = "auto"
  }
  host.setAttribute("data-side", side)
}

const createButton = (
  options: ToolbarButtonOptions,
): { handle: ToolbarButtonHandle; el: HTMLButtonElement } => {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.setAttribute(ATTR_BUTTON, options.id)
  btn.setAttribute("aria-label", options.label)
  btn.title = options.label
  // Per the tools handoff: rail buttons are 34×32 with a 7px radius. Active
  // state uses amber-soft fill with an amber-hairline border, ink colored
  // amber-deep. Inactive is transparent with ink-2 text.
  btn.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "display:grid",
    "place-items:center",
    `width:${tokens.size.tap}`,
    `height:${tokens.size.tapH}`,
    `border-radius:${tokens.radius}`,
    `color:${tokens.ink2}`,
    "border:1px solid transparent",
    "cursor:pointer",
    "position:relative",
    "transition:background-color 120ms ease,color 120ms ease,border-color 120ms ease",
  ].join(";")

  btn.addEventListener("mouseenter", () => {
    if (btn.getAttribute("data-active") !== "true") {
      btn.style.backgroundColor = tokens.paper2
    }
  })
  btn.addEventListener("mouseleave", () => {
    if (btn.getAttribute("data-active") !== "true") {
      btn.style.backgroundColor = "transparent"
    }
  })
  btn.addEventListener("mousedown", (e) => e.preventDefault())
  btn.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    options.onClick()
  })

  // Two stacked layers inside the button: the icon, and a positioned badge
  // dot that we toggle independently.
  const iconHost = document.createElement("span")
  iconHost.setAttribute("data-role", "icon")
  iconHost.style.cssText =
    "display:flex;align-items:center;justify-content:center;pointer-events:none"
  iconHost.innerHTML = options.icon
  btn.appendChild(iconHost)

  const badge = document.createElement("span")
  badge.setAttribute("data-role", "badge")
  badge.style.cssText = [
    "position:absolute",
    `top:${tokens.space.sm}`,
    `right:${tokens.space.sm}`,
    `width:${tokens.size.badge}`,
    `height:${tokens.size.badge}`,
    "border-radius:50%",
    `background:${tokens.accent}`,
    `border:1.5px solid ${tokens.navy}`,
    "display:none",
    "pointer-events:none",
  ].join(";")
  btn.appendChild(badge)

  const handle: ToolbarButtonHandle = {
    setIcon(svg) {
      iconHost.innerHTML = svg
    },
    setBadge(visible) {
      badge.style.display = visible ? "block" : "none"
    },
    setActive(active) {
      btn.setAttribute("data-active", String(active))
      if (active) {
        btn.style.backgroundColor = tokens.amberSoft
        btn.style.color = tokens.amberDeep
        btn.style.borderColor = tokens.amberHairline
      } else {
        btn.style.backgroundColor = "transparent"
        btn.style.color = tokens.ink2
        btn.style.borderColor = "transparent"
      }
    },
    setLabel(label) {
      btn.setAttribute("aria-label", label)
      btn.title = label
    },
    click() {
      btn.click()
    },
    getRect() {
      return btn.getBoundingClientRect()
    },
    el: btn,
  }
  return { handle, el: btn }
}

export const mountToolbar = (): ToolbarShell => {
  // Direction A tool rail. 42 wide, 11 radius, paper background, soft
  // popup-style shadow so it reads against any host page (light or dark).
  // We deliberately keep `width:42px` static and let the buttons drive
  // height — the rail grows / shrinks with `addButton`.
  const host = document.createElement("div")
  host.setAttribute(ATTR_TOOLBAR, "")
  host.style.cssText = [
    "position:fixed",
    "top:50%",
    "transform:translateY(-50%)",
    "display:flex",
    "flex-direction:column",
    "align-items:stretch",
    "gap:2px",
    "width:42px",
    "padding:5px 4px",
    `background:${tokens.paper}`,
    `border:1px solid ${tokens.popupBorder}`,
    "border-radius:11px",
    `color:${tokens.ink2}`,
    `font:${tokens.font}`,
    `z-index:${tokens.zToolbar}`,
    `box-shadow:${tokens.shadowPopup}`,
    "pointer-events:auto",
    "user-select:none",
    "-webkit-font-smoothing:antialiased",
  ].join(";")

  let side: ToolbarSide = readSide()
  applySide(host, side)

  const buttonsHost = document.createElement("div")
  buttonsHost.style.cssText =
    "display:flex;flex-direction:column;align-items:stretch;gap:2px"
  host.appendChild(buttonsHost)

  // Side toggle goes below the feature buttons so it stays at the bottom
  // regardless of how many features the toolbar grows. Visually separated by
  // a hairline rule (5px breathing on either side per the handoff).
  const divider = document.createElement("div")
  divider.style.cssText = `height:1px;background:${tokens.rule};margin:5px 5px`
  host.appendChild(divider)

  const sideToggle = document.createElement("button")
  sideToggle.type = "button"
  sideToggle.setAttribute("aria-label", "Flip toolbar side")
  sideToggle.title = "Flip toolbar side"
  sideToggle.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "display:grid",
    "place-items:center",
    `width:${tokens.size.tap}`,
    `height:${tokens.size.tapH}`,
    `border-radius:${tokens.radius}`,
    `color:${tokens.ink2}`,
    "border:1px solid transparent",
    "cursor:pointer",
    "transition:background-color 120ms ease,color 120ms ease",
  ].join(";")
  sideToggle.innerHTML =
    side === "right"
      ? icons.chevronLeft(tokens.icon.sm)
      : icons.chevronRight(tokens.icon.sm)
  sideToggle.addEventListener("mouseenter", () => {
    sideToggle.style.backgroundColor = tokens.paper2
  })
  sideToggle.addEventListener("mouseleave", () => {
    sideToggle.style.backgroundColor = "transparent"
  })
  sideToggle.addEventListener("mousedown", (e) => e.preventDefault())
  host.appendChild(sideToggle)

  const buttons = new Map<string, ToolbarButtonHandle>()
  const sideListeners = new Set<(s: ToolbarSide) => void>()

  sideToggle.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    side = side === "right" ? "left" : "right"
    writeSide(side)
    applySide(host, side)
    sideToggle.innerHTML =
      side === "right"
        ? icons.chevronLeft(tokens.icon.sm)
        : icons.chevronRight(tokens.icon.sm)
    for (const listener of sideListeners) listener(side)
  })

  ;(document.documentElement || document.body).appendChild(host)

  return {
    el: host,
    addButton(options) {
      const { handle, el } = createButton(options)
      buttonsHost.appendChild(el)
      buttons.set(options.id, handle)
      return handle
    },
    getButton(id) {
      return buttons.get(id) ?? null
    },
    getSide() {
      return side
    },
    onSideChange(cb) {
      sideListeners.add(cb)
      return () => sideListeners.delete(cb)
    },
    destroy() {
      sideListeners.clear()
      buttons.clear()
      host.remove()
    },
  }
}
