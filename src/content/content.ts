interface ToastMessage {
  type: "focusquote.toast"
  message: string
  variant?: "info" | "error"
}

const isToastMessage = (msg: unknown): msg is ToastMessage => {
  if (typeof msg !== "object" || msg === null) return false
  const m = msg as Record<string, unknown>
  return m.type === "focusquote.toast" && typeof m.message === "string"
}

const showToast = (text: string, variant: "info" | "error" = "info") => {
  if (typeof document === "undefined" || !document.body) return
  const bg = variant === "error" ? "#7a1f30" : "#16213e"
  const el = document.createElement("div")
  el.textContent = text
  el.setAttribute("data-focusquote-toast", "")
  el.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:2147483647",
    `background:${bg}`,
    "color:#eaeaea",
    "padding:10px 16px",
    "border-radius:10px",
    "font:14px system-ui,-apple-system,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,.3)",
    "opacity:1",
    "transition:opacity 200ms ease",
    "pointer-events:none",
  ].join(";")
  document.body.appendChild(el)
  setTimeout(() => {
    el.style.opacity = "0"
  }, 1800)
  setTimeout(() => el.remove(), 2200)
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (!isToastMessage(msg)) return
  showToast(msg.message, msg.variant ?? "info")
})
