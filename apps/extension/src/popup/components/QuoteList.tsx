import { Trash2 } from "lucide-preact"
import type { Quote } from "@focus-quote/shared"
import { Chip } from "../../ui/primitives"

interface Props {
  quotes: ReadonlyArray<Quote>
  onDelete: (id: Quote["id"]) => void
}

// Format a quote's createdAt as a short, human-friendly relative timestamp
// matching the COMPONENTS.md examples: "2h", "yest", "Tue", "Mar 14".
const formatWhen = (iso: string | null | undefined): string => {
  if (!iso) return ""
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const now = Date.now()
  const diffMs = now - t
  const oneDay = 86_400_000
  if (diffMs < 60_000) return "now"
  if (diffMs < oneDay) {
    const h = Math.round(diffMs / 3_600_000)
    return h <= 0 ? "now" : `${h}h`
  }
  if (diffMs < oneDay * 2) return "yest"
  if (diffMs < oneDay * 7) {
    return new Date(t).toLocaleDateString(undefined, { weekday: "short" })
  }
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

// Derive a 1-2 word title from the quote text. Quotes don't have titles in
// the model, so we use the first sentence (cap at ~6 words) as the serif
// title and the remainder as the 2-line snippet.
const deriveTitleAndSnippet = (text: string): { title: string; snippet: string } => {
  const trimmed = text.trim()
  // Split on the first sentence ender; fall back to a word-count split.
  const sentenceEnd = trimmed.search(/[.!?]\s+/)
  if (sentenceEnd > 0 && sentenceEnd < 120) {
    return {
      title: trimmed.slice(0, sentenceEnd + 1),
      snippet: trimmed.slice(sentenceEnd + 1).trim(),
    }
  }
  // No clean sentence break — use the first ~70 chars as title.
  if (trimmed.length <= 70) return { title: trimmed, snippet: "" }
  return {
    title: trimmed.slice(0, 70).replace(/\s+\S*$/, "") + "…",
    snippet: trimmed.slice(70).trim(),
  }
}

const hostFromUrl = (url: string | null | undefined): string | null => {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

export function QuoteList({ quotes, onDelete }: Props) {
  if (quotes.length === 0) {
    return (
      <div class="rounded-card border border-rule bg-paper p-6 text-center text-[12px] leading-relaxed text-muted">
        Highlight text on any page → click <em>Save quote</em> to start building
        your library.
      </div>
    )
  }
  return (
    <ul class="flex flex-col gap-[7px]">
      {quotes.map((q) => {
        const { title, snippet } = deriveTitleAndSnippet(q.text)
        const host = hostFromUrl(q.sourceUrl)
        const sourceLine =
          q.sourceTitle || host
            ? `— ${[q.sourceTitle, host].filter(Boolean).join(" · ")}`
            : null
        const when = formatWhen(q.createdAt)
        return (
          <li
            key={q.id}
            class="group rounded-card border border-rule bg-paper px-3 py-[11px] transition-colors hover:bg-paper-2"
          >
            <div class="mb-[5px] flex items-center justify-between gap-2">
              {q.tag ? (
                <Chip>{q.tag}</Chip>
              ) : (
                <span class="text-[10.5px] text-muted-2">·</span>
              )}
              {when && (
                <span class="font-mono text-[9.5px] uppercase tracking-mono-tight text-muted-2">
                  {when}
                </span>
              )}
            </div>
            <div class="mb-1 font-serif text-[13.5px] font-semibold leading-snug tracking-[-0.005em] text-ink line-clamp-2">
              {q.sourceUrl ? (
                <a
                  href={q.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  class="hover:text-amber-deep"
                >
                  {title}
                </a>
              ) : (
                title
              )}
            </div>
            {snippet && (
              <p class="text-[11.5px] leading-[1.45] text-muted line-clamp-2">
                {snippet}
              </p>
            )}
            <div class="mt-[7px] flex items-center justify-between gap-2">
              <span class="truncate font-mono text-[9.5px] uppercase tracking-mono-tight text-muted-2">
                {sourceLine ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => onDelete(q.id)}
                aria-label="Delete quote"
                class="shrink-0 rounded-md p-1 text-muted-2 opacity-0 transition-opacity hover:text-clay-ink group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep/40"
              >
                <Trash2 size={12} strokeWidth={1.7} />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
