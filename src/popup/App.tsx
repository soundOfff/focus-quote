import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import { RefreshCw } from "lucide-preact"
import { QuotesService } from "../services/quotes"
import { SyncService } from "../services/sync"
import { getOrCreateDeviceId } from "../shared/ids"
import { runP } from "./runtime"
import { QuoteList } from "./components/QuoteList"
import { SearchBar } from "./components/SearchBar"
import { SessionPanel } from "./components/SessionPanel"
import type { Quote, DeviceId } from "../shared/schema"

const loadQuotes = (query: string) =>
  Effect.gen(function* () {
    const quotes = yield* QuotesService
    const list = query.trim()
      ? yield* quotes.search(query)
      : yield* quotes.list(10)
    return list as ReadonlyArray<Quote>
  })

export function App() {
  const [query, setQuery] = useState("")
  const [quotes, setQuotes] = useState<ReadonlyArray<Quote>>([])
  const [deviceId, setDeviceId] = useState<DeviceId | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = (q: string) =>
    runP(loadQuotes(q))
      .then(setQuotes)
      .catch((e) => console.error("[FocusQuote] load quotes:", e))

  useEffect(() => {
    runP(getOrCreateDeviceId).then(setDeviceId).catch(console.error)
    refresh("")
  }, [])

  useEffect(() => {
    const t = setTimeout(() => refresh(query), 120)
    return () => clearTimeout(t)
  }, [query])

  const handleDelete = (id: Quote["id"]) => {
    if (!deviceId) return
    runP(
      Effect.gen(function* () {
        const quotes = yield* QuotesService
        yield* quotes.remove(id, deviceId)
      }),
    )
      .then(() => refresh(query))
      .catch(console.error)
  }

  const handleSync = () => {
    setBusy(true)
    runP(
      Effect.gen(function* () {
        const sync = yield* SyncService
        return yield* sync.drain
      }),
    )
      .then(() => refresh(query))
      .catch(console.error)
      .finally(() => setBusy(false))
  }

  return (
    <div class="flex flex-col gap-3 p-4">
      <header class="flex items-center justify-between">
        <h1 class="text-base font-semibold text-accent">FocusQuote</h1>
        <button
          type="button"
          onClick={handleSync}
          disabled={busy}
          class="flex items-center gap-1 rounded px-2 py-1 text-xs opacity-70 hover:opacity-100 disabled:opacity-40"
          title="Sync now"
        >
          <RefreshCw size={12} class={busy ? "animate-spin" : undefined} />
          Sync
        </button>
      </header>

      <SessionPanel />

      <SearchBar value={query} onInput={setQuery} />
      <QuoteList quotes={quotes} onDelete={handleDelete} />
    </div>
  )
}
