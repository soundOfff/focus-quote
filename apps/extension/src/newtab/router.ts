import { useEffect, useState } from "preact/hooks"

// Tiny hash-based router for the newtab.
// Routes:
//   ""                    → home
//   "#/session/<id>"      → session detail
//
// Why hash-based: the newtab is opened by Chrome directly, and hash routing
// reloads cleanly without confusing Chrome's tab management.

export type Route =
  | { name: "home" }
  | { name: "session-detail"; sessionId: string }

export const parseHash = (hash: string): Route => {
  const h = hash.startsWith("#") ? hash.slice(1) : hash
  const m = h.match(/^\/session\/([^/]+)$/)
  if (m && m[1]) return { name: "session-detail", sessionId: m[1] }
  return { name: "home" }
}

export const useRoute = (): Route => {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash),
  )
  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash))
    window.addEventListener("hashchange", handler)
    return () => window.removeEventListener("hashchange", handler)
  }, [])
  return route
}

export const navigateTo = (path: string) => {
  window.location.hash = path
}

export const navigateHome = () => {
  // Use replaceState rather than setting hash="" so the URL doesn't keep "#"
  if (window.history.replaceState) {
    window.history.replaceState(null, "", window.location.pathname)
    window.dispatchEvent(new HashChangeEvent("hashchange"))
  } else {
    window.location.hash = ""
  }
}
