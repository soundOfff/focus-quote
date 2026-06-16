/**
 * Renders the magic-link email to disk so you can preview it in a browser —
 * no Resend call, no network, no env needed.
 *
 *   cd apps/server && npx tsx scripts/preview-magic-link.ts
 *
 * Writes ./tmp/magic-link-preview.html and prints the path. Open it in a
 * browser (web fonts load over the network; everything else is self-contained).
 * Optionally pass a custom URL and expiry: `... preview-magic-link.ts "<url>" 10`
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  renderMagicLinkHtml,
  renderMagicLinkText,
} from "../src/email/magic-link-template"

const url =
  process.argv[2] ??
  "https://app.focusquote.io/auth/verify?token=8f3c9a2e-1b47-4d6a-9e02-7c5f1a8b6d34"
const minutes = process.argv[3] ? Number(process.argv[3]) : 5

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, "..", "tmp")
const outFile = join(outDir, "magic-link-preview.html")

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, renderMagicLinkHtml(url, minutes))

console.log("HTML preview written to:\n  " + outFile)
console.log("\nPlain-text version:\n")
console.log(renderMagicLinkText(url, minutes))
