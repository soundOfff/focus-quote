import { Effect } from "effect"
import { Check, ExternalLink, FolderClosed, X } from "lucide-preact"
import { useEffect, useMemo, useState } from "preact/hooks"
import type { Quote, QuoteId } from "@focus-quote/shared"
import { QuotesService } from "../../services/quotes"
import { runP } from "../runtime"
import { EmptyState } from "../../ui/primitives"
import {
  UNFILED_LABEL,
  folderTagOf,
  groupQuotesIntoFolders,
  filterQuotesByFolder,
  type FolderSelection,
} from "../../shared/quote-folders"

const loadQuotes = Effect.gen(function* () {
  const q = yield* QuotesService
  return yield* q.list()
})

const moveQuote = (id: QuoteId, folder: string | null) =>
  Effect.gen(function* () {
    const q = yield* QuotesService
    return yield* q.setFolder(id, folder)
  })

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

function FolderChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      class={cx(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70",
        active
          ? "border-ink bg-surface-soft text-ink"
          : "border-hairline text-mute hover:border-hairline hover:text-body",
      )}
    >
      <span>{label}</span>
      <span class="tabular-nums text-[11px] text-mute">{count}</span>
    </button>
  )
}

export function HomeQuotesPanel() {
  const [quotes, setQuotes] = useState<ReadonlyArray<Quote>>([])
  const [ready, setReady] = useState(false)
  const [selected, setSelected] = useState<FolderSelection>(undefined)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  const reload = () =>
    runP(loadQuotes)
      .then(setQuotes)
      .catch(() => setQuotes([]))
      .finally(() => setReady(true))

  useEffect(() => {
    reload()
  }, [])

  const folders = useMemo(() => groupQuotesIntoFolders(quotes), [quotes])
  const visible = useMemo(
    () => filterQuotesByFolder(quotes, selected).slice(0, 40),
    [quotes, selected],
  )

  const beginEdit = (q: Quote) => {
    setEditingId(q.id)
    setEditValue(folderTagOf(q) ?? "")
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditValue("")
  }
  const commitEdit = (id: QuoteId) => {
    const value = editValue.trim()
    cancelEdit()
    runP(moveQuote(id, value ? value : null))
      .then(reload)
      .catch(() => {})
  }

  if (!ready) return null
  if (quotes.length === 0) {
    return (
      <EmptyState
        title="No quotes yet"
        description="Highlight text on any page and use Save to FocusQuote to build your collection."
      />
    )
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-1.5">
        <FolderChip
          label="All"
          count={quotes.length}
          active={selected === undefined}
          onClick={() => setSelected(undefined)}
        />
        {folders.map((f) => (
          <FolderChip
            key={f.label}
            label={f.label}
            count={f.count}
            active={selected === f.tag}
            onClick={() => setSelected(f.tag)}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <p class="px-1 py-6 text-center text-xs text-mute">
          No quotes in this folder.
        </p>
      ) : (
        <ul class="flex flex-col gap-2">
          {visible.map((q) => {
            const folderLabel = folderTagOf(q) ?? UNFILED_LABEL
            const editing = editingId === q.id
            return (
              <li
                key={q.id}
                class="rounded-md border border-hairline bg-surface px-4 py-3"
              >
                <blockquote class="font-serif text-sm font-medium leading-snug text-ink">
                  {q.text}
                </blockquote>
                <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {(q.sourceTitle || q.sourceUrl) && (
                    <div class="flex items-center gap-1 text-[11px] text-mute">
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

                  <div class="ml-auto flex items-center gap-1.5">
                    {editing ? (
                      <>
                        <input
                          type="text"
                          value={editValue}
                          placeholder={UNFILED_LABEL}
                          autoFocus
                          onInput={(e) =>
                            setEditValue(
                              (e.currentTarget as HTMLInputElement).value,
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit(q.id)
                            if (e.key === "Escape") cancelEdit()
                          }}
                          class="h-7 w-36 rounded-md border border-hairline-soft bg-canvas px-2 text-xs text-ink outline-none focus:ring-1 focus:ring-focus-ring/70"
                        />
                        <button
                          type="button"
                          onClick={() => commitEdit(q.id)}
                          aria-label="Save folder"
                          class="grid h-7 w-7 place-items-center rounded-md border border-hairline-soft text-mute hover:text-ink"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          aria-label="Cancel"
                          class="grid h-7 w-7 place-items-center rounded-md border border-hairline-soft text-mute hover:text-ink"
                        >
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEdit(q)}
                        aria-label={`Move quote — currently in ${folderLabel}`}
                        class="inline-flex items-center gap-1 rounded-pill border border-hairline px-2 py-0.5 text-[11px] font-medium text-mute transition-colors hover:border-hairline hover:text-body"
                      >
                        <FolderClosed size={11} aria-hidden />
                        {folderLabel}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
