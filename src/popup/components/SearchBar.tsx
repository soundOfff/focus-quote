import { Search } from "lucide-preact"

interface Props {
  value: string
  onInput: (v: string) => void
}

export function SearchBar({ value, onInput }: Props) {
  return (
    <label class="relative block">
      <Search
        size={14}
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50"
      />
      <input
        type="search"
        placeholder="Search quotes or tags…"
        value={value}
        onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
        class="w-full rounded bg-card-dark/60 py-2 pl-8 pr-3 text-sm placeholder:opacity-50 focus:bg-card-dark focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </label>
  )
}
