import { ExternalLink, Quote as QuoteIcon } from "lucide-preact"
import type { Quote } from "@focus-quote/shared"
import { Button } from "../../ui/primitives"

interface Props {
  quote: Quote | null
}

export function DailyQuote({ quote }: Props) {
  if (!quote) {
    return (
      <div class="rounded-md border border-hairline border-dashed bg-surface px-6 py-10 text-center">
        <QuoteIcon
          size={28}
          class="mx-auto mb-3 text-primary opacity-80"
          strokeWidth={1.5}
          aria-hidden
        />
        <p class="text-sm text-mute">
          No quotes in your vault yet. Highlight text on any page and save it to
          FocusQuote.
        </p>
      </div>
    )
  }

  return (
    <figure class="rounded-md border border-hairline bg-surface p-5">
      <div class="mb-4 text-primary">
        <QuoteIcon size={36} strokeWidth={1.25} class="opacity-90" aria-hidden />
      </div>
      <blockquote class="font-serif text-balance text-xl font-bold leading-snug tracking-tight text-ink md:text-2xl">
        {quote.text}
      </blockquote>
      {(quote.sourceTitle || quote.sourceUrl || quote.tag) && (
        <figcaption class="mt-5 font-sans text-[10px] font-semibold leading-relaxed tracking-[0.12em] text-mute">
          {quote.sourceUrl ? (
            <a
              href={quote.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-x-1 gap-y-0.5 text-link-blue transition-colors hover:text-ink"
            >
              <span class="uppercase">
                {[quote.tag, quote.sourceTitle ?? quote.sourceUrl]
                  .filter(Boolean)
                  .join(" — ")}
              </span>
            </a>
          ) : (
            <span class="uppercase">
              {[quote.tag, quote.sourceTitle].filter(Boolean).join(" — ")}
            </span>
          )}
        </figcaption>
      )}
      <div class="mt-4 flex flex-wrap justify-end gap-2">
        {quote.sourceUrl && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            class="!rounded-md !px-4 !text-[10px] !font-bold uppercase tracking-wider"
            onClick={() => window.open(quote.sourceUrl!, "_blank")}
          >
            View source
          </Button>
        )}
      </div>
    </figure>
  )
}
