import { Trash2, Link as LinkIcon } from "lucide-preact"
import type { Quote } from "@focus-quote/shared"

interface Props {
  quotes: ReadonlyArray<Quote>
  onDelete: (id: Quote["id"]) => void
}

export function QuoteList({ quotes, onDelete }: Props) {
  if (quotes.length === 0) {
    return (
      <div class="rounded bg-card-light p-6 text-center text-sm opacity-60 shadow-sm dark:bg-card-dark/60 dark:shadow-none">
        Highlight text on any page → right-click → <em>Save to FocusQuote</em>.
      </div>
    )
  }
  return (
    <ul class="flex flex-col gap-2">
      {quotes.map((q) => (
        <li
          key={q.id}
          class="group rounded bg-card-light p-3 text-sm shadow-sm transition hover:bg-card-light/70 dark:bg-card-dark dark:shadow-none dark:hover:bg-card-dark/80"
        >
          <p class="line-clamp-3 leading-snug">{q.text}</p>
          <div class="mt-2 flex items-center justify-between gap-2 text-xs opacity-60">
            <span class="flex min-w-0 items-center gap-1">
              {q.sourceUrl ? (
                <a
                  href={q.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  class="flex min-w-0 items-center gap-1 hover:text-accent"
                  title={q.sourceUrl}
                >
                  <LinkIcon size={12} />
                  <span class="truncate">{q.sourceTitle ?? q.sourceUrl}</span>
                </a>
              ) : (
                <span class="truncate">No source</span>
              )}
              {q.tag && (
                <span class="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                  {q.tag}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onDelete(q.id)}
              class="opacity-0 transition group-hover:opacity-100 hover:text-accent"
              aria-label="Delete quote"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
