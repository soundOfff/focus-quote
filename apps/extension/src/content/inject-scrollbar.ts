import { tokens } from "./toolbar/tokens"

const STYLE_ID = "focusquote-scrollbar-host"

/**
 * Injects scrollbar rules for `[data-fq-scrollbar]` on the host page so toolbar
 * surfaces match DESIGN.MD without loading Tailwind. Safe to call once per document.
 */
export function injectHostScrollbarStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const { track, thumb, thumbHover } = tokens.scrollbar
  const el = document.createElement("style")
  el.id = STYLE_ID
  el.textContent = `
[data-fq-scrollbar] {
  scrollbar-width: thin;
  scrollbar-color: ${thumb} ${track};
}
[data-fq-scrollbar]::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
[data-fq-scrollbar]::-webkit-scrollbar-track {
  background: transparent;
}
[data-fq-scrollbar]::-webkit-scrollbar-thumb {
  background-color: ${thumb};
  border-radius: 9999px;
  border: 2px solid transparent;
  background-clip: content-box;
}
[data-fq-scrollbar]::-webkit-scrollbar-thumb:hover {
  background-color: ${thumbHover};
}
[data-fq-scrollbar]::-webkit-scrollbar-corner {
  background: transparent;
}
`
  document.documentElement.appendChild(el)
}
