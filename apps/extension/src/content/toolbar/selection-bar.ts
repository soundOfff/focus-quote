import { tokens } from "./tokens"
import { icons } from "./icons"
import {
  TRANSLATE_LANGUAGES,
} from "../../shared/translation"
import { openLangDropdown, type LangDropdownHandle } from "./lang-dropdown"
import {
  enableSelectionColor,
  disableSelectionColor,
  paintBridge,
} from "./selection-highlight"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectionBar {
  root: HTMLDivElement
  show: (text: string, rect: DOMRect, range?: Range) => void
  hide: () => void
  isVisible: () => boolean
  position: (rect: DOMRect) => void
  setFromLang: (code: string) => void
  setToLang: (code: string) => void
  getFromLang: () => string
  getToLang: () => string
  showSavedState: () => void
  isDropdownOpen: () => boolean
  /** True while a translation result card is shown; the bar stays pinned. */
  isResultOpen: () => boolean
  destroy: () => void
}

export interface SelectionBarOptions {
  onSave: (text: string) => void
  /**
   * Translate hook. Kept as the sole secondary action — capture-time manual
   * tagging was removed in ADR 0003 (the AI files quotes; manual tagging lives
   * in the Tag tree browser).
   */
  onTranslate: (
    text: string,
    from: string,
    to: string,
    signal: AbortSignal,
  ) => Promise<string>
  onLanguageChange: (from: string, to: string) => void
  initialFromLang: string
  initialToLang: string
}

// ---------------------------------------------------------------------------
// Font stacks (content-script safe, no CSS vars)
// ---------------------------------------------------------------------------

const FONT_SANS = `"Geist",system-ui,-apple-system,"Segoe UI","Helvetica Neue",sans-serif`
const FONT_MONO = `"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const labelByCode = (code: string): string => {
  if (code === "auto") return "Auto"
  const found = TRANSLATE_LANGUAGES.find((l) => l.code === code)
  return found?.label ?? code.toUpperCase()
}

const createHairline = (): HTMLDivElement => {
  const el = document.createElement("div")
  el.style.cssText = [
    "width:1px",
    "align-self:stretch",
    `background:${tokens.rule}`,
    "margin:3px 1px",
  ].join(";")
  return el
}

// ---------------------------------------------------------------------------
// Save button
// ---------------------------------------------------------------------------

interface SaveButtonHandle {
  el: HTMLButtonElement
  setSaved: (saved: boolean) => void
}

const createSaveButton = (onClick: () => void): SaveButtonHandle => {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.setAttribute("aria-label", "Save quote")

  const applyDefault = () => {
    btn.style.cssText = [
      "all:unset",
      "box-sizing:border-box",
      "display:inline-flex",
      "align-items:center",
      "gap:6px",
      "border-radius:7px",
      "padding:7px 11px 7px 9px",
      "font-size:12.5px",
      "font-weight:600",
      "letter-spacing:-0.005em",
      "white-space:nowrap",
      "cursor:pointer",
      `font-family:${FONT_SANS}`,
      `background:${tokens.amberGradient}`,
      "color:#2A1A05",
      `border:1px solid ${tokens.amberDeep}`,
      `box-shadow:${tokens.shadowAmber}`,
    ].join(";")
    btn.innerHTML = `${icons.bookmark(13, 1.8)}<span>Save quote</span>`
  }

  const applySaved = () => {
    btn.style.cssText = [
      "all:unset",
      "box-sizing:border-box",
      "display:inline-flex",
      "align-items:center",
      "gap:6px",
      "border-radius:7px",
      "padding:7px 11px 7px 9px",
      "font-size:12.5px",
      "font-weight:600",
      "letter-spacing:-0.005em",
      "white-space:nowrap",
      "cursor:default",
      `font-family:${FONT_SANS}`,
      `background:${tokens.sageSoft}`,
      `color:${tokens.sageInk}`,
      "border:1px solid #C6D7C2",
      "box-shadow:none",
    ].join(";")
    btn.innerHTML = `${icons.check(13, 2.2)}<span>Saved</span>`
  }

  applyDefault()

  btn.addEventListener("click", onClick)

  return {
    el: btn,
    setSaved: (saved) => {
      if (saved) applySaved()
      else applyDefault()
    },
  }
}

// ---------------------------------------------------------------------------
// Lang picker chip
// ---------------------------------------------------------------------------

interface LangChipHandle {
  el: HTMLButtonElement
  setLang: (code: string) => void
  getLang: () => string
}

const createLangChip = (
  caption: string,
  onClick: () => void,
): LangChipHandle => {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "display:inline-flex",
    "align-items:center",
    "gap:7px",
    `background:${tokens.paper2}`,
    `border:1px solid ${tokens.rule}`,
    `border-radius:${tokens.radius}`,
    "padding:5px 7px 5px 8px",
    "cursor:pointer",
    `color:${tokens.ink}`,
    "font-size:12px",
    "font-weight:500",
    "line-height:1.1",
    "white-space:nowrap",
    `font-family:${FONT_SANS}`,
    "transition:border-color 120ms ease",
  ].join(";")

  btn.addEventListener("mouseenter", () => {
    btn.style.borderColor = tokens.rule2
  })
  btn.addEventListener("mouseleave", () => {
    btn.style.borderColor = tokens.rule
  })
  btn.addEventListener("click", onClick)

  // Stacked label + value
  const labelGroup = document.createElement("span")
  labelGroup.style.cssText =
    "display:inline-flex;flex-direction:column;align-items:flex-start;gap:1px"

  const caps = document.createElement("span")
  caps.textContent = caption
  caps.style.cssText = [
    `font-family:${FONT_MONO}`,
    "font-size:8.5px",
    "font-weight:500",
    "letter-spacing:0.12em",
    "text-transform:uppercase",
    `color:${tokens.muted}`,
  ].join(";")
  labelGroup.appendChild(caps)

  const nameEl = document.createElement("span")
  nameEl.style.cssText = [
    "font-size:12px",
    "font-weight:500",
    `color:${tokens.ink}`,
  ].join(";")
  labelGroup.appendChild(nameEl)

  btn.appendChild(labelGroup)

  // ISO badge
  const badge = document.createElement("span")
  badge.style.cssText = [
    `font-family:${FONT_MONO}`,
    "font-size:9px",
    "font-weight:600",
    `color:${tokens.muted}`,
    `background:${tokens.paper}`,
    `border:1px solid ${tokens.rule}`,
    "border-radius:4px",
    "padding:1px 4px",
    "letter-spacing:0.06em",
  ].join(";")
  btn.appendChild(badge)

  // Chevron-down
  const chev = document.createElement("span")
  chev.innerHTML = icons.chevronDown(10)
  chev.style.cssText = `display:inline-flex;color:${tokens.muted2}`
  btn.appendChild(chev)

  let currentCode = ""
  const setLang = (code: string) => {
    currentCode = code
    nameEl.textContent = labelByCode(code)
    badge.textContent = code.toUpperCase()
  }
  const getLang = () => currentCode

  return { el: btn, setLang, getLang }
}

// ---------------------------------------------------------------------------
// Arrow cap
// ---------------------------------------------------------------------------

const createArrowCap = (): HTMLSpanElement => {
  const el = document.createElement("span")
  el.style.cssText = [
    "width:18px",
    "height:24px",
    // Center within the (taller) chips instead of pinning to the frame top.
    "align-self:center",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    `color:${tokens.muted2}`,
  ].join(";")
  el.innerHTML = icons.arrowRight(11, 1.6)
  return el
}

// ---------------------------------------------------------------------------
// Trailing icon buttons
// ---------------------------------------------------------------------------

const createGlobeButton = (onClick: () => void): HTMLButtonElement => {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.setAttribute("aria-label", "Translate selection")
  btn.title = "Translate selection"
  btn.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "display:inline-flex",
    "align-items:center",
    "gap:5px",
    `background:${tokens.paper2}`,
    `border:1px solid ${tokens.rule}`,
    `border-radius:${tokens.radius}`,
    "padding:0 9px",
    "cursor:pointer",
    `color:${tokens.ink2}`,
    "font-size:11.5px",
    "font-weight:500",
    `font-family:${FONT_SANS}`,
    "transition:background-color 120ms ease",
  ].join(";")
  const iconWrap = document.createElement("span")
  iconWrap.innerHTML = icons.globe(13, 1.7)
  iconWrap.style.cssText = `display:inline-flex;color:${tokens.muted}`
  btn.appendChild(iconWrap)
  btn.addEventListener("click", onClick)
  btn.addEventListener("mouseenter", () => {
    btn.style.background = tokens.paper
  })
  btn.addEventListener("mouseleave", () => {
    btn.style.background = tokens.paper2
  })
  return btn
}


// ---------------------------------------------------------------------------
// Caret (the little arrow pointing toward the selection)
// ---------------------------------------------------------------------------

interface CaretHandle {
  el: HTMLDivElement
  setAbove: (above: boolean) => void
  setOffset: (leftPx: number) => void
}

const createCaret = (): CaretHandle => {
  const el = document.createElement("div")
  el.style.cssText = [
    "position:absolute",
    "width:12px",
    "height:12px",
    `background:${tokens.paper}`,
    "pointer-events:none",
  ].join(";")

  const setAbove = (above: boolean) => {
    if (above) {
      // Caret below the frame, pointing down
      el.style.borderTop = `1px solid ${tokens.popupBorder}`
      el.style.borderLeft = `1px solid ${tokens.popupBorder}`
      el.style.borderRight = "1px solid transparent"
      el.style.borderBottom = "1px solid transparent"
      el.style.transform = "rotate(225deg)"
      el.style.bottom = "-7px"
      el.style.top = ""
    } else {
      // Caret above the frame, pointing up
      el.style.borderTop = `1px solid ${tokens.popupBorder}`
      el.style.borderLeft = `1px solid ${tokens.popupBorder}`
      el.style.borderRight = "1px solid transparent"
      el.style.borderBottom = "1px solid transparent"
      el.style.transform = "rotate(45deg)"
      el.style.top = "-7px"
      el.style.bottom = ""
    }
  }

  const setOffset = (leftPx: number) => {
    el.style.left = `${leftPx}px`
  }

  // Default: above selection, caret points down
  setAbove(true)

  return { el, setAbove, setOffset }
}

// ---------------------------------------------------------------------------
// Result card (translation output)
// ---------------------------------------------------------------------------

const createResultCard = (): HTMLDivElement => {
  const el = document.createElement("div")
  el.setAttribute("data-fq-scrollbar", "")
  el.style.cssText = [
    "display:none",
    "max-width:360px",
    "width:100%",
    `background:${tokens.paper}`,
    `color:${tokens.ink}`,
    `border:1px solid ${tokens.popupBorder}`,
    `border-radius:${tokens.radiusMd}`,
    "padding:10px 12px",
    `font:13px/1.5 ${FONT_SANS}`,
    "white-space:pre-wrap",
    "word-break:break-word",
    "max-height:200px",
    "overflow:auto",
    `box-shadow:${tokens.shadowToolbar}`,
    "margin-top:6px",
  ].join(";")
  return el
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSelectionBar(opts: SelectionBarOptions): SelectionBar {
  const {
    onSave,
    onTranslate,
    onLanguageChange,
    initialFromLang,
    initialToLang,
  } = opts

  let pendingText = ""
  let pendingRange: Range | null = null
  let visible = false
  let savedTimeout: ReturnType<typeof setTimeout> | null = null
  let hideTimeout: ReturnType<typeof setTimeout> | null = null
  let translateAbort: AbortController | null = null
  let currentDropdown: LangDropdownHandle | null = null
  let lastRect: DOMRect | null = null

  // ---- Root ----
  const root = document.createElement("div")
  root.setAttribute("data-focusquote-selection-bar", "")
  // Resting state is fully inert: invisible, behind everything, and
  // click-through. `show()` promotes it to the popover layer; `hide()` returns
  // it here so the faded-out bar can never intercept clicks on the page.
  root.style.cssText = [
    "all:initial",
    "box-sizing:border-box",
    "position:fixed",
    "z-index:-1",
    "display:flex",
    "flex-direction:column",
    "align-items:flex-start",
    "user-select:none",
    "pointer-events:none",
    "opacity:0",
    "transform:translateY(-4px)",
    "transition:opacity 150ms ease,transform 150ms ease",
  ].join(";")

  root.addEventListener("mousedown", (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  // ---- Frame (the cream pill) ----
  const frame = document.createElement("div")
  frame.style.cssText = [
    "position:relative",
    "display:inline-flex",
    "align-items:stretch",
    `background:${tokens.paper}`,
    `border:1px solid ${tokens.popupBorder}`,
    `border-radius:${tokens.radiusMd}`,
    "padding:4px",
    "gap:4px",
    `box-shadow:${tokens.shadowToolbar}`,
    "white-space:nowrap",
    `font-family:${FONT_SANS}`,
    `color:${tokens.ink}`,
  ].join(";")

  // ---- Children ----

  const saveButton = createSaveButton(() => {
    if (!pendingText) return
    onSave(pendingText)
    showSavedState()
  })

  const fromChip = createLangChip("From", () => {
    if (currentDropdown) {
      currentDropdown.close()
      return
    }
    // The dropdown's filter input will steal focus and collapse the native
    // selection; bridge the amber highlight with an overlay so it persists.
    if (pendingRange) paintBridge(pendingRange)
    const rect = fromChip.el.getBoundingClientRect()
    currentDropdown = openLangDropdown(rect, {
      currentCode: fromChip.getLang(),
      mode: "from",
      anchorEl: fromChip.el,
      onSelect: (code) => {
        fromChip.setLang(code)
        onLanguageChange(code, toChip.getLang())
      },
      onClose: () => {
        currentDropdown = null
      },
    })
  })

  const toChip = createLangChip("To", () => {
    if (currentDropdown) {
      currentDropdown.close()
      return
    }
    // The dropdown's filter input will steal focus and collapse the native
    // selection; bridge the amber highlight with an overlay so it persists.
    if (pendingRange) paintBridge(pendingRange)
    const rect = toChip.el.getBoundingClientRect()
    currentDropdown = openLangDropdown(rect, {
      currentCode: toChip.getLang(),
      mode: "to",
      anchorEl: toChip.el,
      onSelect: (code) => {
        toChip.setLang(code)
        onLanguageChange(fromChip.getLang(), code)
      },
      onClose: () => {
        currentDropdown = null
      },
    })
  })

  fromChip.setLang(initialFromLang)
  toChip.setLang(initialToLang)

  const globeBtn = createGlobeButton(() => {
    if (!pendingText) return
    handleTranslate()
  })

  const arrowCap = createArrowCap()

  frame.appendChild(saveButton.el)
  frame.appendChild(createHairline())
  frame.appendChild(fromChip.el)
  frame.appendChild(arrowCap)
  frame.appendChild(toChip.el)
  frame.appendChild(createHairline())
  frame.appendChild(globeBtn)

  // ---- Caret ----
  const caret = createCaret()
  frame.appendChild(caret.el)

  root.appendChild(frame)

  // ---- Result card ----
  const resultCard = createResultCard()
  root.appendChild(resultCard)

  // ---- Positioning ----

  const position = (rect: DOMRect) => {
    lastRect = rect
    const margin = 8
    const caretDiag = 7 // half the rotated caret diagonal
    const r = frame.getBoundingClientRect()
    const frameW = r.width > 0 ? r.width : 380
    const frameH = r.height > 0 ? r.height : 38

    const resultH =
      resultCard.style.display !== "none"
        ? resultCard.getBoundingClientRect().height + 6
        : 0
    const totalH = frameH + caretDiag + resultH

    const aboveTop = rect.top - totalH - margin
    const useAbove = aboveTop > 8

    const top = useAbove
      ? rect.top - totalH - margin
      : rect.bottom + margin + caretDiag

    let left = rect.left + rect.width / 2 - frameW / 2
    left = Math.max(8, Math.min(left, window.innerWidth - frameW - 8))

    root.style.top = `${top}px`
    root.style.left = `${left}px`

    // Caret offset relative to frame
    const selMidX = rect.left + rect.width / 2
    let caretLeft = selMidX - left - 6 // 6 = half of 12px caret
    caretLeft = Math.max(12, Math.min(caretLeft, frameW - 24))
    caret.setOffset(caretLeft)
    caret.setAbove(useAbove)
  }

  // ---- Translation ----

  const handleTranslate = () => {
    const text = pendingText.slice(0, 500)
    if (!text) return
    const from = fromChip.getLang() || "auto"
    const to = toChip.getLang() || "en"

    if (from !== "auto" && from === to) {
      resultCard.style.display = "block"
      resultCard.style.color = tokens.muted
      resultCard.textContent = "Source and target languages match."
      if (lastRect) requestAnimationFrame(() => position(lastRect!))
      return
    }

    resultCard.style.display = "block"
    resultCard.style.color = tokens.muted2
    resultCard.textContent = "Translating…"
    if (lastRect) requestAnimationFrame(() => position(lastRect!))

    translateAbort?.abort()
    translateAbort = new AbortController()

    onTranslate(text, from, to, translateAbort.signal)
      .then((out) => {
        resultCard.style.color = tokens.ink
        resultCard.textContent = out
        if (lastRect) requestAnimationFrame(() => position(lastRect!))
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return
        resultCard.style.color = "#cd4239"
        resultCard.textContent =
          err instanceof Error && err.message === "translate_quota_exhausted"
            ? "Daily free translations reached. Resets at midnight UTC."
            : `Translation failed: ${err instanceof Error ? err.message : "unknown"}`
        if (lastRect) requestAnimationFrame(() => position(lastRect!))
      })
  }

  // ---- Public API ----

  const show = (text: string, rect: DOMRect, range?: Range) => {
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      hideTimeout = null
    }
    pendingText = text
    pendingRange = range ?? null
    // Recolour the native selection to the brand amber. It's already on from the
    // mid-drag selectionchange; this just guarantees it for the popup's life.
    enableSelectionColor()
    position(rect)
    requestAnimationFrame(() => position(rect))
    root.style.zIndex = String(tokens.zPopover)
    root.style.pointerEvents = "auto"
    root.style.opacity = "1"
    root.style.transform = "translateY(0)"
    visible = true
  }

  const hide = () => {
    if (!visible) return
    disableSelectionColor()
    pendingRange = null
    if (currentDropdown) {
      currentDropdown.close()
      currentDropdown = null
    }
    root.style.opacity = "0"
    root.style.transform = "translateY(-4px)"
    // Stop intercepting clicks the instant we start fading; the remaining
    // animation is purely visual.
    root.style.pointerEvents = "none"
    // Once the fade has played, drop the (now-invisible) bar out of the
    // stacking context so it can never sit above or hit-test against the page.
    if (hideTimeout) clearTimeout(hideTimeout)
    hideTimeout = setTimeout(() => {
      hideTimeout = null
      root.style.zIndex = "-1"
    }, 160)
    resultCard.style.display = "none"
    resultCard.textContent = ""
    translateAbort?.abort()
    translateAbort = null
    if (savedTimeout) {
      clearTimeout(savedTimeout)
      savedTimeout = null
    }
    saveButton.setSaved(false)
    visible = false
  }

  const showSavedState = () => {
    saveButton.setSaved(true)
    if (savedTimeout) clearTimeout(savedTimeout)
    savedTimeout = setTimeout(() => {
      savedTimeout = null
      window.getSelection()?.removeAllRanges()
      hide()
    }, 1500)
  }

  const destroy = () => {
    hide()
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      hideTimeout = null
    }
    root.remove()
  }

  return {
    root,
    show,
    hide,
    isVisible: () => visible,
    position,
    setFromLang: (code) => fromChip.setLang(code),
    setToLang: (code) => toChip.setLang(code),
    getFromLang: () => fromChip.getLang(),
    getToLang: () => toChip.getLang(),
    showSavedState,
    isDropdownOpen: () => currentDropdown !== null,
    isResultOpen: () => resultCard.style.display !== "none",
    destroy,
  }
}
