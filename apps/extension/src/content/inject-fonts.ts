const STYLE_ID = "focusquote-fonts-host"

const FONTS: ReadonlyArray<{
  family: string
  weight: number
  file: string
}> = [
  { family: "Geist", weight: 400, file: "geist-sans-latin-400-normal.woff2" },
  { family: "Geist", weight: 500, file: "geist-sans-latin-500-normal.woff2" },
  { family: "Geist", weight: 600, file: "geist-sans-latin-600-normal.woff2" },
  { family: "JetBrains Mono", weight: 500, file: "jetbrains-mono-latin-500-normal.woff2" },
  { family: "JetBrains Mono", weight: 600, file: "jetbrains-mono-latin-600-normal.woff2" },
]

export function injectHostFonts(): void {
  if (document.getElementById(STYLE_ID)) return
  const rules = FONTS.map((f) => {
    const url = chrome.runtime.getURL(`assets/fonts/${f.file}`)
    return `@font-face {
  font-family: "${f.family}";
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url("${url}") format("woff2");
}`
  }).join("\n")

  const el = document.createElement("style")
  el.id = STYLE_ID
  el.textContent = rules
  document.documentElement.appendChild(el)
}
