import { toolbarStore } from "./store"

type ActionKind = "click" | "focus" | "blur" | "submit" | "scroll" | "nav"

interface ActionCaptureOptions {
  getSessionId: () => string | null
  shouldTrackUrl: (url: URL) => boolean
  onAction?: (event: {
    sessionId: string
    actionKind: ActionKind
    payload: string
    at: string
  }) => void
}

const text80 = (value: string): string => value.trim().replace(/\s+/g, " ").slice(0, 80)

const getElementLabel = (el: Element): string | null => {
  const aria = el.getAttribute("aria-label")
  if (aria) return text80(aria)
  if (el instanceof HTMLInputElement && el.labels && el.labels.length > 0) {
    return text80(el.labels[0]?.textContent ?? "")
  }
  return null
}

const cssEscape = (value: string): string =>
  value.replace(/([^\w-])/g, "\\$1")

const getUniqueSelector = (el: Element | null): string => {
  if (!el) return "unknown"
  const chunks: string[] = []
  let node: Element | null = el
  let depth = 0
  while (node && depth < 4) {
    const testId = node.getAttribute("data-testid")
    if (testId) {
      chunks.unshift(`[data-testid="${cssEscape(testId)}"]`)
      break
    }
    if (node.id) {
      chunks.unshift(`#${cssEscape(node.id)}`)
      break
    }
    const parent: Element | null = node.parentElement
    if (!parent) {
      chunks.unshift(node.tagName.toLowerCase())
      break
    }
    const siblings = (Array.from(parent.children) as Element[]).filter(
      (c: Element) => c.tagName === node?.tagName,
    )
    const idx = siblings.indexOf(node) + 1
    chunks.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${idx})`)
    node = parent
    depth += 1
  }
  return chunks.join(" > ")
}

const emit = (
  kind: ActionKind,
  payload: Record<string, unknown>,
  options: ActionCaptureOptions,
) => {
  const sessionId = options.getSessionId()
  if (!sessionId) return
  const at = new Date().toISOString()
  const event = {
    id: crypto.randomUUID(),
    sessionId,
    actionKind: kind,
    payload: JSON.stringify(payload).slice(0, 4000),
    at,
  }
  toolbarStore.getState().appendAction(event)
  options.onAction?.({
    sessionId,
    actionKind: kind,
    payload: event.payload,
    at,
  })
}

export const mountActionCapture = (options: ActionCaptureOptions): (() => void) => {
  const canTrack = () => {
    try {
      return options.shouldTrackUrl(new URL(location.href))
    } catch {
      return false
    }
  }

  const onClick = (e: MouseEvent) => {
    if (!canTrack()) return
    const el = e.target instanceof Element ? e.target : null
    if (!el) return
    emit(
      "click",
      {
        selector: getUniqueSelector(el),
        text: text80(el.textContent ?? ""),
        tagName: el.tagName.toLowerCase(),
      },
      options,
    )
  }

  const onFocus = (e: FocusEvent) => {
    if (!canTrack()) return
    const el = e.target instanceof Element ? e.target : null
    if (!el) return
    emit(
      "focus",
      {
        selector: getUniqueSelector(el),
        tagName: el.tagName.toLowerCase(),
        type: el instanceof HTMLInputElement ? el.type : null,
        name: el instanceof HTMLInputElement ? el.name || null : null,
        label: getElementLabel(el),
      },
      options,
    )
  }

  const onBlur = (e: FocusEvent) => {
    if (!canTrack()) return
    const el = e.target instanceof Element ? e.target : null
    if (!el) return
    emit(
      "blur",
      {
        selector: getUniqueSelector(el),
        tagName: el.tagName.toLowerCase(),
      },
      options,
    )
  }

  const onSubmit = (e: Event) => {
    if (!canTrack()) return
    const form = e.target instanceof HTMLFormElement ? e.target : null
    if (!form) return
    emit(
      "submit",
      {
        selector: getUniqueSelector(form),
        fieldCount: form.elements.length,
      },
      options,
    )
  }

  let lastMilestone = -1
  let scrollRaf = 0
  const onScroll = () => {
    if (scrollRaf) return
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0
      if (!canTrack()) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (max <= 0) return
      const pct = (window.scrollY / max) * 100
      const milestone = pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : 0
      if (milestone > 0 && milestone !== lastMilestone) {
        lastMilestone = milestone
        emit("scroll", { milestone }, options)
      }
    })
  }

  document.addEventListener("click", onClick, true)
  document.addEventListener("focus", onFocus, true)
  document.addEventListener("blur", onBlur, true)
  document.addEventListener("submit", onSubmit, true)
  window.addEventListener("scroll", onScroll, { passive: true, capture: true })

  return () => {
    document.removeEventListener("click", onClick, true)
    document.removeEventListener("focus", onFocus, true)
    document.removeEventListener("blur", onBlur, true)
    document.removeEventListener("submit", onSubmit, true)
    window.removeEventListener("scroll", onScroll, true)
  }
}
