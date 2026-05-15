import { icons } from "./icons"
import { tokens } from "./tokens"
import type { ToolbarShell } from "./shell"
import {
  openPopover,
  popoverButton,
  popoverInput,
  type PopoverHandle,
} from "./popover"
import { apiPost, ApiCallError } from "./api"
import { toolbarStore } from "../store"
import type { GuideStep, GuideStepsResponse } from "@focus-quote/shared"

/**
 * Ghost Cursor Guide Me — Part 4.
 *
 * The user types a goal. We send it to /api/ai/guide-steps which returns an
 * ordered list of `{instruction, x, y, description}` waypoints in normalized
 * viewport coordinates. We then render an animated semi-transparent cursor
 * that walks through them with playback controls.
 *
 * Coordinates are normalized so window resizes during playback don't break.
 * Everything is dismissed by any click outside the cursor / control surface.
 */

interface GuideController {
  destroy: () => void
}

const STEP_TRANSITION_MS = 600
const STEP_HOLD_MS = 1800

const cursorSvg = (): string => `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="${tokens.accent}" aria-hidden="true">
  <path d="M6 3 L6 21 L11 16 L14 22 L17 21 L14 14 L21 14 Z" stroke="${tokens.accent}" stroke-width="0.75" stroke-linejoin="round"/>
</svg>`

let liveMouse = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 }
let pendingMouse: { x: number; y: number } | null = null
let rafMouse = 0
document.addEventListener(
  "mousemove",
  (e) => {
    pendingMouse = { x: e.clientX, y: e.clientY }
    if (rafMouse) return
    rafMouse = requestAnimationFrame(() => {
      rafMouse = 0
      if (!pendingMouse) return
      liveMouse = pendingMouse
      pendingMouse = null
    })
  },
  { passive: true },
)

const renderGuideUI = (
  shell: ToolbarShell,
  opts: { resume?: boolean } = {},
): GuideController => {
  // The cursor is two stacked elements:
  //   - outer (`cursor`): driven by `offset-path` (or `left/top` fallback).
  //     We avoid putting any transform on this element because the offset-path
  //     animation overwrites `transform`, which would silently break centering.
  //   - inner (`cursorInner`): owns the visual offset that points the SVG's
  //     tip at the outer element's coordinate, plus the pulse halo behind it.
  // The pulse ring sits on the inner element so its radius is measured from
  // the SVG's tip, not from the outer element's top-left.
  const cursor = document.createElement("div")
  cursor.setAttribute("data-focusquote-guide-cursor", "")
  cursor.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "width:0",
    "height:0",
    "pointer-events:none",
    `z-index:${tokens.zCursor}`,
    "will-change:offset-distance,left,top",
  ].join(";")
  const cursorInner = document.createElement("div")
  cursorInner.style.cssText = [
    "position:absolute",
    "width:28px",
    "height:28px",
    // Center the 28x28 visual on the outer's anchor point. The original code
    // applied this translate to the outer element, but `offset-path` clobbers
    // `transform` so the centering silently dropped — landing the cursor's
    // tip several pixels away from the target.
    "left:-14px",
    "top:-14px",
    "border-radius:50%",
    "opacity:0.9",
    "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
  ].join(";")
  cursorInner.innerHTML = cursorSvg()
  cursor.appendChild(cursorInner)

  if (!document.getElementById("focusquote-guide-keyframes")) {
    const style = document.createElement("style")
    style.id = "focusquote-guide-keyframes"
    style.textContent = `
      @keyframes focusquote-guide-cursor-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(233, 69, 96, 0.55); }
        70%  { box-shadow: 0 0 0 14px rgba(233, 69, 96, 0); }
        100% { box-shadow: 0 0 0 0 rgba(233, 69, 96, 0); }
      }
    `
    document.head.appendChild(style)
  }
  cursorInner.style.animation =
    "focusquote-guide-cursor-pulse 1300ms ease-out infinite"

  const tooltip = document.createElement("div")
  tooltip.setAttribute("data-focusquote-guide-tooltip", "")
  tooltip.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "max-width:260px",
    "padding:8px 10px",
    `background:${tokens.navy}`,
    `border:1px solid ${tokens.tealDim}`,
    `border-radius:${tokens.radius}`,
    `color:${tokens.ink}`,
    `font:${tokens.font}`,
    "font-size:12px",
    "pointer-events:none",
    `z-index:${tokens.zCursor}`,
    `transition:transform ${STEP_TRANSITION_MS}ms ease-in-out,opacity 180ms ease`,
    "opacity:0",
    "white-space:normal",
    "line-height:1.4",
  ].join(";")

  const card = document.createElement("div")
  card.setAttribute("data-focusquote-guide-card", "")
  card.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:24px",
    "transform:translateX(-50%)",
    `z-index:${tokens.zCursor}`,
    `background:${tokens.navy}`,
    `border:1px solid ${tokens.tealDim}`,
    `border-radius:${tokens.radius}`,
    `color:${tokens.ink}`,
    `font:${tokens.font}`,
    "min-width:360px",
    "max-width:520px",
    "padding:10px 12px",
    "display:flex",
    "flex-direction:column",
    "gap:8px",
    "pointer-events:auto",
  ].join(";")

  const controls = document.createElement("div")
  controls.style.cssText =
    "display:flex;align-items:center;gap:6px;flex-wrap:wrap"

  const meta = document.createElement("div")
  meta.style.cssText = [
    "display:flex",
    "align-items:baseline",
    "gap:8px",
    `color:${tokens.inkMute}`,
    "font-size:11px",
    "letter-spacing:0.04em",
    "text-transform:uppercase",
  ].join(";")

  const counter = document.createElement("span")
  meta.appendChild(counter)

  const instructionLine = document.createElement("div")
  instructionLine.style.cssText = `font-size:14px;line-height:1.4;color:${tokens.ink};font-weight:600`

  const descriptionLine = document.createElement("div")
  descriptionLine.style.cssText = `font-size:12px;line-height:1.5;color:${tokens.inkMute}`

  const mkCtl = (label: string, iconSvg: string, primary = false) => {
    const b = document.createElement("button")
    b.type = "button"
    b.title = label
    b.setAttribute("aria-label", label)
    b.innerHTML = `${iconSvg}<span style="margin-left:6px">${label}</span>`
    b.style.cssText = [
      "all:unset",
      "box-sizing:border-box",
      "display:inline-flex",
      "align-items:center",
      "padding:5px 9px",
      "border-radius:4px",
      "cursor:pointer",
      "font-size:12px",
      "font-weight:600",
      primary
        ? `background:${tokens.accent};color:#fff`
        : `color:${tokens.ink};border:1px solid ${tokens.hairline}`,
      "transition:background-color 120ms ease",
    ].join(";")
    return b
  }

  const playPauseBtn = mkCtl("Pause", icons.pause(14), true)
  const restartBtn = mkCtl("Restart", icons.restart(14))
  const stepBtn = mkCtl("Step-by-step", icons.step(14))
  const exitBtn = mkCtl("Exit", icons.x(14))

  controls.append(playPauseBtn, restartBtn, stepBtn, exitBtn)
  card.append(meta, instructionLine, descriptionLine, controls)

  const elements = [cursor, tooltip, card]
  for (const el of elements) {
    ;(document.documentElement || document.body).appendChild(el)
  }

  let waypointTimer: number | null = null
  let motion: Animation | null = null
  let destroyed = false
  const supportsOffsetPath = CSS.supports("offset-path", "path('M0 0')")
  let lastPoint = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 }
  const getState = () => toolbarStore.getState().guide

  const setPlayPauseUI = () => {
    const status = getState().status
    if (status === "playing") {
      playPauseBtn.innerHTML = `${icons.pause(14)}<span style="margin-left:6px">Pause</span>`
    } else if (status === "stepping") {
      playPauseBtn.innerHTML = `${icons.play(14)}<span style="margin-left:6px">Resume</span>`
    } else {
      playPauseBtn.innerHTML = `${icons.play(14)}<span style="margin-left:6px">Play</span>`
    }
  }

  const renderStepText = () => {
    const state = getState()
    const step = state.steps[state.index]
    if (!step) return
    counter.textContent = `Step ${state.index + 1} of ${state.steps.length}`
    instructionLine.textContent = step.instruction
    descriptionLine.textContent = step.description
  }

  const positionTooltip = (step: GuideStep) => {
    const w = window.innerWidth
    const h = window.innerHeight
    const x = Math.round(step.x * w)
    const y = Math.round(step.y * h)
    const tr = tooltip.getBoundingClientRect()
    const tw = tr.width
    const th = tr.height
    const gap = 24
    const edge = 8
    const placeRight = x <= liveMouse.x
    const placeBelow = y <= liveMouse.y
    let tx = placeRight ? x + gap : x - tw - gap
    let ty = placeBelow ? y + gap : y - th - gap
    tx = Math.max(edge, Math.min(w - tw - edge, tx))
    ty = Math.max(edge, Math.min(h - th - edge, ty))
    tooltip.style.transform = `translate(${tx}px, ${ty}px)`
    tooltip.textContent = step.description
    tooltip.style.opacity = "1"
  }

  const toPx = (step: GuideStep) => ({
    x: Math.round(step.x * window.innerWidth),
    y: Math.round(step.y * window.innerHeight),
  })

  const animateCursorTo = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    motion?.cancel()
    if (supportsOffsetPath) {
      const mx = (from.x + to.x) / 2
      const my = (from.y + to.y) / 2
      const dx = to.x - from.x
      const dy = to.y - from.y
      const len = Math.hypot(dx, dy) || 1
      const bend = Math.min(120, len * 0.25)
      const cx = mx + (-dy / len) * bend
      const cy = my + (dx / len) * bend
      cursor.style.offsetPath = `path("M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}")`
      cursor.style.offsetRotate = "0deg"
      cursor.style.offsetDistance = "0%"
      motion = cursor.animate(
        [{ offsetDistance: "0%" }, { offsetDistance: "100%" }],
        {
          duration: STEP_TRANSITION_MS,
          easing: "cubic-bezier(.4,0,.2,1)",
          fill: "forwards",
        },
      )
      return
    }
    cursor.style.transition = `left ${STEP_TRANSITION_MS}ms ease-in-out, top ${STEP_TRANSITION_MS}ms ease-in-out`
    cursor.style.left = `${to.x}px`
    cursor.style.top = `${to.y}px`
  }

  const advance = () => {
    if (destroyed) return
    const state = getState()
    if (state.index >= state.steps.length) {
      toolbarStore.getState().patchGuide({ status: "ended" })
      setPlayPauseUI()
      counter.textContent = `Done — ${state.steps.length} steps`
      instructionLine.textContent = "All steps complete."
      descriptionLine.textContent =
        "Click anywhere to dismiss, or press Restart."
      return
    }
    const step = state.steps[state.index]!
    renderStepText()
    const target = toPx(step)
    animateCursorTo(lastPoint, target)
    lastPoint = target
    positionTooltip(step)

    if (state.status === "stepping") {
      return
    }

    if (waypointTimer) window.clearTimeout(waypointTimer)
    waypointTimer = window.setTimeout(() => {
      if (getState().status !== "playing") return
      toolbarStore.getState().patchGuide({ index: getState().index + 1 })
      advance()
    }, STEP_HOLD_MS + STEP_TRANSITION_MS)
  }

  const pause = () => {
    if (getState().status === "ended") return
    toolbarStore.getState().patchGuide({ status: "paused" })
    if (waypointTimer) window.clearTimeout(waypointTimer)
    motion?.pause()
    setPlayPauseUI()
  }
  const play = () => {
    if (getState().status === "ended") return
    toolbarStore.getState().patchGuide({ status: "playing" })
    motion?.play()
    setPlayPauseUI()
    advance()
  }
  const togglePlayPause = () => {
    if (getState().status === "playing") pause()
    else play()
  }
  const restart = () => {
    toolbarStore.getState().patchGuide({ index: 0, status: "playing" })
    if (waypointTimer) window.clearTimeout(waypointTimer)
    const first = getState().steps[0]
    if (first) {
      const px = toPx(first)
      lastPoint = { x: px.x, y: Math.max(0, px.y - 32) }
      cursor.style.left = `${lastPoint.x}px`
      cursor.style.top = `${lastPoint.y}px`
    }
    setPlayPauseUI()
    advance()
  }
  const enterStepMode = () => {
    const state = getState()
    if (state.status === "ended") return
    toolbarStore.getState().patchGuide({ status: "stepping" })
    if (waypointTimer) window.clearTimeout(waypointTimer)
    setPlayPauseUI()
    counter.textContent = `Step ${state.index + 1} of ${state.steps.length} · Press → to advance`
  }

  playPauseBtn.addEventListener("click", togglePlayPause)
  restartBtn.addEventListener("click", restart)
  stepBtn.addEventListener("click", enterStepMode)
  exitBtn.addEventListener("click", () => destroy())

  const onResize = () => {
    const state = getState()
    const step = state.steps[state.index]
    if (step) {
      const p = toPx(step)
      cursor.style.left = `${p.x}px`
      cursor.style.top = `${p.y}px`
      lastPoint = p
      positionTooltip(step)
    }
  }
  window.addEventListener("resize", onResize, { passive: true })

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      destroy()
      return
    }
    if (getState().status === "stepping" && e.key === "ArrowRight") {
      e.preventDefault()
      toolbarStore.getState().patchGuide({ index: getState().index + 1 })
      advance()
    }
  }
  document.addEventListener("keydown", onKey)

  const destroy = () => {
    if (destroyed) return
    destroyed = true
    if (waypointTimer) window.clearTimeout(waypointTimer)
    motion?.cancel()
    window.removeEventListener("resize", onResize)
    document.removeEventListener("keydown", onKey)
    for (const el of elements) el.remove()
    toolbarStore.getState().closeGuide()
  }

  if (opts.resume) {
    const state = getState()
    if (state.steps.length > 0) {
      const index = Math.max(0, Math.min(state.index, state.steps.length - 1))
      if (index !== state.index) {
        toolbarStore.getState().patchGuide({ index })
      }
      const step = getState().steps[index]
      if (step) {
        lastPoint = toPx(step)
        cursor.style.left = `${lastPoint.x}px`
        cursor.style.top = `${lastPoint.y}px`
        renderStepText()
        positionTooltip(step)
      }
      setPlayPauseUI()
      if (getState().status === "playing") {
        advance()
      }
    }
  } else {
    restart()
  }

  return { destroy }
}

const renderPromptForm = (
  body: HTMLElement,
  initialGoal: string,
  onSubmit: (goal: string) => void,
) => {
  body.replaceChildren()
  const wrap = document.createElement("div")
  wrap.style.cssText = "display:flex;flex-direction:column;gap:8px"
  const hint = document.createElement("div")
  hint.style.cssText = `font-size:12px;color:${tokens.inkMute};line-height:1.5`
  hint.textContent =
    "Describe what you want to do (e.g. \"Show me how to disable my account\"). I'll trace a ghost cursor through the steps."

  const input = popoverInput("How do I…")
  input.value = initialGoal
  const row = document.createElement("div")
  row.style.cssText = "display:flex;justify-content:flex-end;gap:6px"
  const go = popoverButton("Generate")
  row.append(go)

  wrap.append(hint, input, row)
  body.appendChild(wrap)
  setTimeout(() => input.focus(), 30)

  const submit = () => {
    const goal = input.value.trim()
    if (!goal) {
      input.focus()
      return
    }
    onSubmit(goal)
  }
  go.addEventListener("click", submit)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      submit()
    }
  })
}

const renderLoadingState = (body: HTMLElement) => {
  body.replaceChildren()
  const el = document.createElement("div")
  el.style.cssText = [
    "padding:8px 10px",
    `background:${tokens.navyDeep}`,
    `border:1px solid ${tokens.hairline}`,
    "border-radius:4px",
    `color:${tokens.inkMute}`,
    "font-size:13px",
    "line-height:1.4",
  ].join(";")
  el.textContent = "Asking the AI for a step-by-step plan…"
  body.appendChild(el)
}

const renderErrorState = (
  body: HTMLElement,
  message: string,
  onRetry: () => void,
) => {
  body.replaceChildren()
  const wrap = document.createElement("div")
  wrap.style.cssText = "display:flex;flex-direction:column;gap:8px"
  const msg = document.createElement("div")
  msg.style.cssText = [
    "padding:8px 10px",
    `background:${tokens.navyDeep}`,
    `border:1px solid ${tokens.accentDim}`,
    "border-radius:4px",
    `color:${tokens.ink}`,
    "font-size:13px",
    "line-height:1.4",
  ].join(";")
  msg.textContent = message
  const row = document.createElement("div")
  row.style.cssText = "display:flex;justify-content:flex-end;gap:6px"
  const retry = popoverButton("Try again")
  retry.addEventListener("click", onRetry)
  row.append(retry)
  wrap.append(msg, row)
  body.appendChild(wrap)
}

export const installGuideButton = (shell: ToolbarShell): (() => void) => {
  let currentPopover: PopoverHandle | null = null
  let currentAbort: AbortController | null = null
  let currentController: GuideController | null = null
  let lastGoal = ""

  const closePopover = () => {
    currentPopover?.close()
  }

  const submit = async (goal: string) => {
    if (!currentPopover) return
    lastGoal = goal
    renderLoadingState(currentPopover.body)
    currentAbort?.abort()
    currentAbort = new AbortController()
    try {
      const res = await apiPost<GuideStepsResponse>(
        "/api/ai/guide-steps",
        { goal, sourceUrl: location.href },
        currentAbort.signal,
      )
      if (!Array.isArray(res.steps) || res.steps.length === 0) {
        throw new ApiCallError("The AI didn't return any steps. Try a more specific goal.")
      }
      // We're about to take over the screen — close the popover but keep the
      // controller wired up so the playback card can clean it up properly.
      const steps = [...res.steps] as GuideStep[]
      toolbarStore.getState().openGuide(goal, steps)
      currentPopover?.close()
      currentPopover = null
      currentController?.destroy()
      currentController = renderGuideUI(shell)
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      const message =
        err instanceof ApiCallError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong"
      if (!currentPopover) return
      renderErrorState(currentPopover.body, message, () => submit(goal))
    }
  }

  const onClick = () => {
    // Active playback: button toggles dismissal.
    if (currentController) {
      currentController.destroy()
      currentController = null
      return
    }
    if (currentPopover) {
      closePopover()
      return
    }
    currentPopover = openPopover({
      title: "Guide Me",
      anchor: () => btn.getRect(),
      shell,
      dismissOnOutsideClick: false,
      onClose: () => {
        currentPopover = null
        currentAbort?.abort()
        currentAbort = null
      },
    })
    renderPromptForm(currentPopover.body, lastGoal, submit)
  }

  const btn = shell.addButton({
    id: "guide",
    label: "Guide Me",
    icon: icons.wand(tokens.icon.md),
    onClick,
  })

  const persisted = toolbarStore.getState().guide
  if (persisted.isOpen && persisted.steps.length > 0) {
    currentController = renderGuideUI(shell, { resume: true })
  }

  return () => {
    currentAbort?.abort()
    currentController?.destroy()
    currentPopover?.close()
  }
}
