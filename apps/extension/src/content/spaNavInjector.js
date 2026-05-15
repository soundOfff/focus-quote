;(() => {
  const FLAG = "__focusquote_spa_nav_installed__"
  if (window[FLAG]) return
  window[FLAG] = true

  const fire = (url) => {
    window.postMessage({ source: "focusquote", type: "spa-nav", url }, "*")
  }

  const wrap = (key) => {
    const original = history[key]
    history[key] = function (...args) {
      const result = original.apply(this, args)
      fire(location.href)
      return result
    }
  }

  wrap("pushState")
  wrap("replaceState")
  window.addEventListener("popstate", () => fire(location.href))

  const title = document.querySelector("title")
  if (title) {
    new MutationObserver(() => fire(location.href)).observe(title, {
      childList: true,
      characterData: true,
      subtree: true,
    })
  }
})()
