// Self-hosted webfonts for the Direction A look. Each extension entry
// point (popup, options, newtab) imports this barrel exactly once; the
// content script intentionally does NOT, since host pages enforce their
// own CSP and we don't want to fail noisily on strict ones — the in-page
// selection toolbar uses system fallbacks declared in
// `content/toolbar/tokens.ts`.
//
// Weights cover every cut the Direction A surfaces use. The Session-detail
// page (docs/Session Detail.html) pulls the full set: Newsreader 400/500/600
// (+ 400 italic for the serif-italic empty notes) at its serif moments, Geist
// 300–700 for body/UI, and JetBrains Mono 400/500/600 for labels — the 400 cut
// carries the recall counter and the read-URL lines, which have no weight set
// and so default to 400.
import "@fontsource/newsreader/400.css"
import "@fontsource/newsreader/400-italic.css"
import "@fontsource/newsreader/500.css"
import "@fontsource/newsreader/600.css"
import "@fontsource/newsreader/700.css"
import "@fontsource/geist-sans/300.css"
import "@fontsource/geist-sans/400.css"
import "@fontsource/geist-sans/500.css"
import "@fontsource/geist-sans/600.css"
import "@fontsource/geist-sans/700.css"
import "@fontsource/jetbrains-mono/400.css"
import "@fontsource/jetbrains-mono/500.css"
import "@fontsource/jetbrains-mono/600.css"
