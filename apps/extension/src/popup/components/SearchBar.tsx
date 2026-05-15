import { Search } from "lucide-preact"

interface Props {
  value: string
  onInput: (v: string) => void
}

// Direction A search input. Paper bg (sits on the paper-2 drawer), small
// search glyph at left-11px, 12.5px text.
export function SearchBar({ value, onInput }: Props) {
  return (
    <label class="relative block">
      <Search
        size={13}
        strokeWidth={1.7}
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
        aria-hidden
      />
      <input
        type="search"
        placeholder="Search quotes or tags…"
        value={value}
        onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
        class="w-full rounded-control border border-rule-2 bg-paper py-2 pl-8 pr-3 text-[12.5px] text-ink placeholder:text-muted-2 focus:border-amber-deep focus:outline-none focus:ring-[3px] focus:ring-amber/15"
      />
    </label>
  )
}
