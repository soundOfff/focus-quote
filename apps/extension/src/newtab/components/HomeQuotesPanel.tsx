import { Effect } from "effect"
import { ExternalLink } from "lucide-preact"
import { useEffect, useState } from "preact/hooks"
import type { Quote } from "@focus-quote/shared"
import { QuotesService } from "../../services/quotes"
import { runP } from "../runtime"
import { EmptyState } from "../../ui/primitives"

const loadQuotes = Effect.gen(function* () {
  const q = yield* QuotesService
  return yield* q.list()
})

export function HomeQuotesPanel() {
  const [quotes, setQuotes] = useState<ReadonlyArray<Quote>>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    runP(loadQuotes)
      .then(setQuotes)
      .catch(() => setQuotes([]))
      .finally(() => setReady(true))
  }, [])

  if (!ready) return null
  if (quotes.length === 0) {
    return (
      <EmptyState
        title="No quotes yet"
        description="Highlight text on any page and use Save to FocusQuote to build your vault."
      />
    )
  }

  return (
    <ul class="flex flex-col gap-2">
      {quotes.slice(0, 40).map((q) => (
        <li
          key={q.id}
          class="rounded-md border border-hairline bg-surface px-4 py-3"
        >
          <blockquote class="font-serif text-sm font-medium leading-snug text-ink">
            {q.text}
          </blockquote>
          {(q.sourceTitle || q.sourceUrl) && (
            <div class="mt-2 flex items-center gap-1 text-[11px] text-mute">
              {q.sourceUrl ? (
                <a
                  href={q.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-0.5 font-medium text-link-blue hover:underline"
                >
                  {q.sourceTitle ?? q.sourceUrl}
                  <ExternalLink size={10} aria-hidden />
                </a>
              ) : (
                <span>{q.sourceTitle}</span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
