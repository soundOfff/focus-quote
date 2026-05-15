;(() => {
  const FLAG = "__focusquote_notif_bridge_installed__"
  if (window[FLAG]) return
  window[FLAG] = true

  const STATE_KEY = "__focusquote_notif__"
  const MESSAGE_TYPE = "focusquote.notifications.override"
  const SOURCE = "focusquote"

  const restore = () => {
    const state = window[STATE_KEY]
    if (!state || !state.applied) return
    try {
      window.Notification.requestPermission = state.origRequest
    } catch (_) {}
    try {
      delete window.Notification.permission
    } catch (_) {}
    state.applied = false
  }

  const apply = () => {
    if (typeof window.Notification === "undefined") return
    const current = window[STATE_KEY]
    if (current && current.applied) return
    const origRequest = window.Notification.requestPermission
    const origCtor = window.Notification
    window[STATE_KEY] = { applied: true, origRequest, origCtor }
    try {
      window.Notification.requestPermission = function () {
        const result = "denied"
        if (arguments.length > 0 && typeof arguments[0] === "function") {
          try {
            arguments[0](result)
          } catch (_) {}
        }
        return Promise.resolve(result)
      }
    } catch (_) {}
    try {
      Object.defineProperty(window.Notification, "permission", {
        configurable: true,
        get() {
          return "denied"
        },
      })
    } catch (_) {}
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== SOURCE || data.type !== MESSAGE_TYPE) return
    if (data.blocked === true) apply()
    else restore()
  })
})()
