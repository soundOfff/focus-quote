import type { ComponentChildren } from "preact"
import { createPortal } from "preact/compat"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks"
import { Check, ChevronDown } from "lucide-preact"

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

export interface DropdownOption<T extends string> {
  value: T
  /** Display text. Also used for keyboard type-ahead matching. */
  label: string
}

type Placement = "bottom" | "top"

interface Coords {
  left: number
  top: number
  width: number
  maxHeight: number
  placement: Placement
}

interface DropdownProps<T extends string> {
  value: T
  options: ReadonlyArray<DropdownOption<T>>
  onChange: (value: T) => void
  /** Accessible name for the trigger + listbox. */
  ariaLabel: string
  /** Classes applied to the trigger `<button>`. */
  triggerClass?: string
  /**
   * Custom trigger inner content. When provided the component renders no
   * default label/chevron — the caller owns everything inside the button.
   */
  renderTrigger?: (state: {
    selected: DropdownOption<T> | null
    open: boolean
  }) => ComponentChildren
  placeholder?: string
  disabled?: boolean
}

/**
 * A native-`<select>` replacement that opens its option list *below* the
 * trigger (with viewport flip), instead of deferring to the OS pop-up menu
 * — which on macOS overlays the control. The listbox is portaled to
 * `document.body` so it is never clipped by an `overflow` ancestor, and is
 * repositioned on scroll/resize to stay anchored to the trigger.
 *
 * Implements the ARIA listbox-with-button-trigger pattern: focus moves into
 * the listbox on open and `aria-activedescendant` tracks the highlighted
 * option; full keyboard nav (arrows / Home / End / type-ahead / Enter / Esc).
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  triggerClass,
  renderTrigger,
  placeholder = "Select…",
  disabled = false,
}: DropdownProps<T>) {
  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const optionId = (i: number) => `${baseId}-opt-${i}`

  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef<{ buffer: string; timer: number | null }>({
    buffer: "",
    timer: null,
  })

  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)
  const [entered, setEntered] = useState(false)

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] ?? null : null
  const [activeIndex, setActiveIndex] = useState(selectedIndex)

  const position = useCallback(() => {
    const trigger = triggerRef.current
    const panel = listRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const root = document.documentElement
    const vw = root.clientWidth
    const vh = root.clientHeight
    const gap = 6
    const margin = 8
    const naturalH = panel ? panel.scrollHeight : 0
    const panelW = panel ? panel.offsetWidth : r.width
    const spaceBelow = vh - r.bottom - gap - margin
    const spaceAbove = r.top - gap - margin
    const MAX = 288

    let placement: Placement = "bottom"
    let maxHeight = Math.min(MAX, Math.max(0, spaceBelow))
    // Flip above only when below is genuinely cramped and above has more room.
    if (spaceBelow < Math.min(naturalH, 180) && spaceAbove > spaceBelow) {
      placement = "top"
      maxHeight = Math.min(MAX, Math.max(0, spaceAbove))
    }

    const width = Math.min(Math.max(r.width, panelW), vw - margin * 2)
    let left = r.left
    if (left + width > vw - margin) left = vw - margin - width
    if (left < margin) left = margin

    const renderedH = Math.min(naturalH, maxHeight)
    const top =
      placement === "bottom"
        ? r.bottom + gap
        : Math.max(margin, r.top - gap - renderedH)

    setCoords({ left, top, width, maxHeight, placement })
  }, [])

  // Measure + place before paint whenever the menu opens.
  useLayoutEffect(() => {
    if (open) position()
  }, [open, position])

  // Keep the panel anchored to the trigger while open.
  useEffect(() => {
    if (!open) return
    let raf = 0
    const reflow = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(position)
    }
    window.addEventListener("scroll", reflow, true)
    window.addEventListener("resize", reflow)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", reflow, true)
      window.removeEventListener("resize", reflow)
    }
  }, [open, position])

  // Fade/slide in and move focus into the listbox once it is positioned.
  useEffect(() => {
    if (open && coords) {
      const raf = requestAnimationFrame(() => setEntered(true))
      listRef.current?.focus()
      return () => cancelAnimationFrame(raf)
    }
    setEntered(false)
    return undefined
  }, [open, coords])

  // Dismiss on outside pointer down (without yanking focus back to trigger).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return
      close(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true)
  }, [open])

  // Keep the active option scrolled into view during keyboard nav.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(optionId(activeIndex))?.scrollIntoView({
      block: "nearest",
    })
  }, [activeIndex, open])

  function openMenu() {
    if (disabled) return
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  function close(focusTrigger = true) {
    setOpen(false)
    setCoords(null)
    if (focusTrigger) triggerRef.current?.focus()
  }

  function commit(i: number) {
    const opt = options[i]
    if (opt) onChange(opt.value)
    close()
  }

  function onTriggerKeyDown(e: KeyboardEvent) {
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "Enter" ||
      e.key === " "
    ) {
      e.preventDefault()
      openMenu()
    }
  }

  function handleTypeahead(char: string) {
    const ta = typeahead.current
    if (ta.timer) window.clearTimeout(ta.timer)
    ta.buffer += char.toLowerCase()
    const buffer = ta.buffer
    const match = options.findIndex((o) =>
      o.label.toLowerCase().startsWith(buffer),
    )
    if (match >= 0) setActiveIndex(match)
    ta.timer = window.setTimeout(() => {
      ta.buffer = ""
    }, 500)
  }

  function onListKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setActiveIndex((i) => Math.min(options.length - 1, i + 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
        break
      case "Home":
        e.preventDefault()
        setActiveIndex(0)
        break
      case "End":
        e.preventDefault()
        setActiveIndex(options.length - 1)
        break
      case "Enter":
      case " ":
        e.preventDefault()
        if (activeIndex >= 0) commit(activeIndex)
        break
      case "Escape":
        e.preventDefault()
        close()
        break
      case "Tab":
        close(false)
        break
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          handleTypeahead(e.key)
        }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        // Fold the current selection into the accessible name — otherwise the
        // aria-label would mask the visible value text from screen readers.
        aria-label={selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        class={cx(
          "outline-none disabled:cursor-not-allowed disabled:opacity-60",
          !renderTrigger && "flex items-center justify-between gap-2",
          triggerClass,
          open && "ring-[3px] ring-amber/15",
        )}
      >
        {renderTrigger ? (
          renderTrigger({ selected, open })
        ) : (
          <>
            <span class={cx("truncate", !selected && "text-muted")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronDown
              size={14}
              strokeWidth={2}
              aria-hidden
              class={cx(
                "shrink-0 text-muted transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={
              activeIndex >= 0 ? optionId(activeIndex) : undefined
            }
            onKeyDown={onListKeyDown}
            style={
              coords
                ? {
                    position: "fixed",
                    left: `${coords.left}px`,
                    top: `${coords.top}px`,
                    width: `${coords.width}px`,
                    maxHeight: `${coords.maxHeight}px`,
                  }
                : {
                    position: "fixed",
                    left: "-9999px",
                    top: "0",
                    visibility: "hidden",
                  }
            }
            class={cx(
              "fq-scrollbar z-[2147483630] overflow-y-auto rounded-card border border-hairline bg-surface p-1 shadow-popup outline-none",
              "motion-safe:transition motion-safe:duration-150 motion-safe:ease-out",
              entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
            )}
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === value
              const isActive = i === activeIndex
              return (
                <div
                  key={opt.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => commit(i)}
                  onPointerMove={() => setActiveIndex(i)}
                  class={cx(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-[12.5px] leading-5",
                    isActive ? "bg-surface-soft text-ink" : "text-ink-2",
                  )}
                >
                  <span class="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check
                      size={13}
                      strokeWidth={2.5}
                      aria-hidden
                      class="shrink-0 text-amber-deep"
                    />
                  )}
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
