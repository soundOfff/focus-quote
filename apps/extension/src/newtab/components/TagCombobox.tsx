import { Plus, Search } from "lucide-preact"
import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import type { Tag } from "@focus-quote/shared"

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

interface TagComboboxProps {
  /** Every tag that exists — the search corpus. */
  allTags: ReadonlyArray<Tag>
  /** Ids already on this quote; filtered out of suggestions. */
  existingTagIds: ReadonlySet<string>
  /** Commit a tag by name. Reuses an existing tag (case-insensitive) or
   *  creates a new one — both go through `manualTag` upstream. */
  onSelect: (name: string) => void
  /** Dismiss without committing (Escape, outside click, blur). */
  onClose: () => void
}

/**
 * Searchable tag picker. Type to filter existing tags; pick one with the mouse
 * or keyboard, or create a brand-new tag when nothing matches. Mirrors the
 * inline-input styling it replaces so it sits unchanged in the quote row.
 */
export function TagCombobox({
  allTags,
  existingTagIds,
  onSelect,
  onClose,
}: TagComboboxProps) {
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Tags not already on the quote, ranked: case-insensitive name match,
  // prefix matches first, then the rest, capped so the list stays compact.
  const matches = useMemo(() => {
    const norm = query.trim().toLowerCase()
    const pool = allTags.filter((t) => !existingTagIds.has(t.id))
    if (!norm) {
      return [...pool]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
        .slice(0, 8)
    }
    return pool
      .filter((t) => t.name.toLowerCase().includes(norm))
      .sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(norm) ? 0 : 1
        const bp = b.name.toLowerCase().startsWith(norm) ? 0 : 1
        if (ap !== bp) return ap - bp
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      })
      .slice(0, 8)
  }, [query, allTags, existingTagIds])

  const trimmed = query.trim()
  // Offer "Create" only when the typed name isn't already an exact tag.
  const exact = useMemo(() => {
    const norm = trimmed.toLowerCase()
    return norm ? allTags.some((t) => t.name.toLowerCase() === norm) : false
  }, [trimmed, allTags])
  const canCreate = trimmed.length > 0 && !exact

  // Flat list of selectable rows: existing matches, then the optional create row.
  const options = useMemo(
    () => [
      ...matches.map((t) => ({ kind: "tag" as const, tag: t })),
      ...(canCreate ? [{ kind: "create" as const }] : []),
    ],
    [matches, canCreate],
  )

  // Keep the highlight in range as the option set shrinks/grows.
  useEffect(() => {
    setHighlight((h) => (options.length === 0 ? 0 : Math.min(h, options.length - 1)))
  }, [options.length])

  const choose = (index: number) => {
    const opt = options[index]
    if (!opt) return
    onSelect(opt.kind === "tag" ? opt.tag.name : trimmed)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((h) => (options.length === 0 ? 0 : (h + 1) % options.length))
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) =>
        options.length === 0 ? 0 : (h - 1 + options.length) % options.length,
      )
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      if (options.length > 0) choose(highlight)
      else if (canCreate) onSelect(trimmed)
      return
    }
  }

  // Close when focus leaves the whole widget (click elsewhere, tab out). Guarded
  // by a check on the related target so clicking an option doesn't self-dismiss.
  const onBlur = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null
    if (next && rootRef.current?.contains(next)) return
    onClose()
  }

  return (
    <div ref={rootRef} class="relative" onBlur={onBlur}>
      <div class="flex h-7 w-44 items-center gap-1 rounded-md border border-hairline-soft bg-canvas px-2 focus-within:ring-1 focus-within:ring-focus-ring/70">
        <Search size={11} class="shrink-0 text-mute" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search or create…"
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={onKeyDown}
          class="h-full w-full bg-transparent text-xs text-ink outline-none placeholder:text-mute"
        />
      </div>
      {(options.length > 0 || trimmed.length > 0) && (
        <ul
          role="listbox"
          class="absolute z-20 mt-1 max-h-52 w-44 overflow-y-auto rounded-md border border-hairline bg-surface py-1 shadow-lg"
        >
          {options.length === 0 && !canCreate && (
            <li class="px-2 py-1.5 text-[11px] text-mute">No matching tags</li>
          )}
          {options.map((opt, i) => {
            const active = i === highlight
            return (
              <li key={opt.kind === "tag" ? opt.tag.id : "__create__"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  // Commit before the input's blur fires, so the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(i)}
                  class={cx(
                    "flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors",
                    active ? "bg-surface-soft text-ink" : "text-body hover:bg-surface-soft",
                  )}
                >
                  {opt.kind === "tag" ? (
                    <>
                      <span class="truncate">{opt.tag.name}</span>
                      {opt.tag.userEdited && (
                        <span
                          class="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          title="Pinned (your edit)"
                          aria-hidden
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <Plus size={11} class="shrink-0 text-mute" aria-hidden />
                      <span class="truncate">
                        Create <span class="font-medium text-ink">“{trimmed}”</span>
                      </span>
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
