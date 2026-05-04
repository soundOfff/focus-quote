import type { Quote } from "@focus-quote/shared"

interface Props {
  quote: Quote | null
}

export function DailyQuote({ quote }: Props) {
  if (!quote) {
    return (
      <div class="rounded bg-card-light p-8 text-center text-base opacity-60 dark:bg-card-dark/60">
        No quotes yet. Highlight text on any page and right-click to save.
      </div>
    )
  }
  return (
    <figure class="rounded bg-card-light p-8 shadow-sm dark:bg-card-dark/60 dark:shadow-none">
      <blockquote class="text-2xl leading-snug">
        <span class="mr-1 align-top text-3xl text-accent">“</span>
        {quote.text}
        <span class="ml-1 align-top text-3xl text-accent">”</span>
      </blockquote>
      {(quote.sourceTitle || quote.sourceUrl) && (
        <figcaption class="mt-4 text-right text-sm opacity-60">
          —{" "}
          {quote.sourceUrl ? (
            <a
              class="hover:text-accent"
              href={quote.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {quote.sourceTitle ?? quote.sourceUrl}
            </a>
          ) : (
            <span>{quote.sourceTitle}</span>
          )}
        </figcaption>
      )}
    </figure>
  )
}
