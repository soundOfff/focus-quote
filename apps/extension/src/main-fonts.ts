// Self-hosted webfonts for the Direction A look. Each extension entry
// point (popup, options, newtab) imports this barrel exactly once; the
// content script intentionally does NOT, since host pages enforce their
// own CSP and we don't want to fail noisily on strict ones — the in-page
// selection toolbar uses system fallbacks declared in
// `content/toolbar/tokens.ts`.
//
// Weights kept lean: only the cuts referenced in TOKENS.md ship.
import "@fontsource/newsreader/400.css"
import "@fontsource/newsreader/600.css"
import "@fontsource/geist-sans/400.css"
import "@fontsource/geist-sans/500.css"
import "@fontsource/geist-sans/600.css"
import "@fontsource/jetbrains-mono/500.css"
import "@fontsource/jetbrains-mono/600.css"
