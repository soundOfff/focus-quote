import { tokens } from "./tokens"
import { icons } from "./icons"
import {
  TRANSLATE_LANGUAGES,
  type TranslateLanguageOption,
} from "../../shared/translation"

export interface LangDropdownHandle {
  el: HTMLDivElement
  close: () => void
}

export interface LangDropdownOptions {
  currentCode: string
  mode: "from" | "to"
  /**
   * The chip that opened this dropdown. Clicks on it are ignored by the
   * outside-click dismiss handler so the chip's own onClick can toggle the
   * panel closed (instead of the dismiss racing ahead and reopening it).
   */
  anchorEl: HTMLElement
  onSelect: (code: string) => void
  onClose: () => void
}

const FONT_SANS = `"Geist",system-ui,-apple-system,"Segoe UI","Helvetica Neue",sans-serif`
const FONT_MONO = `"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`

const ALL_FROM_LANGUAGES: ReadonlyArray<TranslateLanguageOption> = [
  { code: "auto", label: "Auto" },
  ...TRANSLATE_LANGUAGES,
]

export function openLangDropdown(
  anchorRect: DOMRect,
  options: LangDropdownOptions,
): LangDropdownHandle {
  const { currentCode, mode, anchorEl, onSelect, onClose } = options
  const languages = mode === "from" ? ALL_FROM_LANGUAGES : TRANSLATE_LANGUAGES

  const panel = document.createElement("div")
  panel.setAttribute("data-focusquote-lang-dropdown", "")
  panel.style.cssText = [
    "all:initial",
    "box-sizing:border-box",
    "position:fixed",
    `z-index:2147483647`,
    "width:188px",
    `background:${tokens.paper}`,
    `border:1px solid ${tokens.popupBorder}`,
    `border-radius:${tokens.radiusMd}`,
    "padding:6px",
    `box-shadow:${tokens.shadowToolbar}`,
    `font-family:${FONT_SANS}`,
    `color:${tokens.ink}`,
  ].join(";")

  // Prevent selection collapse
  panel.addEventListener("mousedown", (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  // Header
  const header = document.createElement("div")
  header.textContent = mode === "from" ? "Translate from" : "Translate to"
  header.style.cssText = [
    `font-family:${FONT_MONO}`,
    "font-size:9.5px",
    "font-weight:500",
    `letter-spacing:0.12em`,
    "text-transform:uppercase",
    `color:${tokens.muted}`,
    "padding:4px 8px 6px",
  ].join(";")
  panel.appendChild(header)

  // Search wrapper
  const searchWrap = document.createElement("div")
  searchWrap.style.cssText = "position:relative;padding:0 4px;margin-bottom:4px"

  const searchIconEl = document.createElement("span")
  searchIconEl.innerHTML = icons.searchIcon(12)
  searchIconEl.style.cssText = [
    "position:absolute",
    "left:12px",
    "top:50%",
    "transform:translateY(-50%)",
    `color:${tokens.muted2}`,
    "display:flex",
    "pointer-events:none",
  ].join(";")
  searchWrap.appendChild(searchIconEl)

  const searchInput = document.createElement("input")
  searchInput.type = "text"
  searchInput.placeholder = "Filter…"
  searchInput.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "width:100%",
    `background:${tokens.paper2}`,
    `border:1px solid ${tokens.rule}`,
    "border-radius:6px",
    "padding:6px 8px 6px 28px",
    "font-size:11.5px",
    `font-family:${FONT_SANS}`,
    `color:${tokens.ink}`,
  ].join(";")
  searchInput.addEventListener("focus", () => {
    searchInput.style.borderColor = tokens.amberDeep
    searchInput.style.boxShadow = "0 0 0 3px rgba(242,160,60,0.15)"
  })
  searchInput.addEventListener("blur", () => {
    searchInput.style.borderColor = tokens.rule
    searchInput.style.boxShadow = "none"
  })
  searchWrap.appendChild(searchInput)
  panel.appendChild(searchWrap)

  // Rows container
  const rowsContainer = document.createElement("div")
  rowsContainer.style.cssText = "max-height:180px;overflow-y:auto"
  rowsContainer.setAttribute("data-fq-scrollbar", "")
  panel.appendChild(rowsContainer)

  const renderRows = (filter: string) => {
    rowsContainer.innerHTML = ""
    const q = filter.toLowerCase()
    const filtered = languages.filter(
      (l) => l.label.toLowerCase().includes(q) || l.code.toLowerCase().includes(q),
    )
    for (const lang of filtered) {
      const isActive = lang.code === currentCode
      const row = document.createElement("button")
      row.type = "button"
      row.style.cssText = [
        "all:unset",
        "box-sizing:border-box",
        "width:100%",
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        "padding:6px 10px",
        "border-radius:6px",
        "cursor:pointer",
        `background:${isActive ? tokens.amberSoft : "transparent"}`,
        `font-size:12px`,
        `font-weight:${isActive ? "600" : "500"}`,
        `font-family:${FONT_SANS}`,
        `color:${tokens.ink}`,
      ].join(";")

      if (!isActive) {
        row.addEventListener("mouseenter", () => {
          row.style.background = tokens.paper2
        })
        row.addEventListener("mouseleave", () => {
          row.style.background = "transparent"
        })
      }

      row.addEventListener("click", () => {
        onSelect(lang.code)
        close()
      })

      // Left: check/spacer + name
      const leftSpan = document.createElement("span")
      leftSpan.style.cssText = "display:inline-flex;align-items:center;gap:6px"

      if (isActive) {
        const checkEl = document.createElement("span")
        checkEl.innerHTML = icons.check(11, 2.2)
        checkEl.style.cssText = `display:inline-flex;color:${tokens.amberDeep}`
        leftSpan.appendChild(checkEl)
      } else {
        const spacer = document.createElement("span")
        spacer.style.cssText = "width:11px"
        leftSpan.appendChild(spacer)
      }

      const nameEl = document.createElement("span")
      nameEl.textContent = lang.label
      leftSpan.appendChild(nameEl)
      row.appendChild(leftSpan)

      // Right: ISO badge
      const badge = document.createElement("span")
      badge.textContent = lang.code.toUpperCase()
      badge.style.cssText = [
        `font-family:${FONT_MONO}`,
        "font-size:9px",
        "font-weight:600",
        `color:${tokens.muted}`,
        `background:${isActive ? tokens.paper : tokens.paper2}`,
        `border:1px solid ${tokens.rule}`,
        "border-radius:4px",
        "padding:1px 4px",
        "letter-spacing:0.06em",
      ].join(";")
      row.appendChild(badge)

      rowsContainer.appendChild(row)
    }
  }

  renderRows("")

  searchInput.addEventListener("input", () => {
    renderRows(searchInput.value)
  })

  // Focus the search input after the panel is in the DOM
  requestAnimationFrame(() => searchInput.focus())

  // Dismiss handlers
  const onDocMouseDown = (e: MouseEvent) => {
    if (panel.contains(e.target as Node)) return
    // Ignore the chip that owns this dropdown — its onClick toggles us closed.
    // Without this, the capture-phase mousedown closes us first, then the
    // chip's click reopens us, so the panel never appears to close on re-click.
    if (anchorEl.contains(e.target as Node)) return
    close()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation()
      close()
    }
  }

  setTimeout(() => {
    document.addEventListener("mousedown", onDocMouseDown, true)
    document.addEventListener("keydown", onKeyDown, true)
  }, 0)

  ;(document.documentElement || document.body).appendChild(panel)

  // Position once the panel is in the DOM and measurable. Prefer opening below
  // the chip, but flip above when there isn't enough room — and cap the scroll
  // area so the panel never spills past the top/bottom of the viewport.
  const positionPanel = (): void => {
    const margin = 8
    const gap = 6
    const panelW = panel.offsetWidth || 190
    const spaceBelow = Math.max(
      0,
      window.innerHeight - anchorRect.bottom - gap - margin,
    )
    const spaceAbove = Math.max(0, anchorRect.top - gap - margin)
    const openUp = panel.offsetHeight > spaceBelow && spaceAbove > spaceBelow

    const avail = openUp ? spaceAbove : spaceBelow
    const chromeH = panel.offsetHeight - rowsContainer.offsetHeight
    const maxRows = Math.max(96, avail - chromeH)
    if (rowsContainer.offsetHeight > maxRows) {
      rowsContainer.style.maxHeight = `${maxRows}px`
    }

    const panelH = panel.offsetHeight
    const top = openUp
      ? Math.max(margin, anchorRect.top - panelH - gap)
      : Math.max(
          margin,
          Math.min(anchorRect.bottom + gap, window.innerHeight - panelH - margin),
        )
    const left = Math.max(
      margin,
      Math.min(anchorRect.left, window.innerWidth - panelW - margin),
    )
    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
  }
  positionPanel()

  let closed = false
  function close() {
    if (closed) return
    closed = true
    document.removeEventListener("mousedown", onDocMouseDown, true)
    document.removeEventListener("keydown", onKeyDown, true)
    panel.remove()
    onClose()
  }

  return { el: panel, close }
}
