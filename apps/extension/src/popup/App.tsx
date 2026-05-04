import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import { Settings as SettingsIcon } from "lucide-preact"
import { QuotesService } from "../services/quotes"
import { StorageService } from "../services/storage"
import { getOrCreateDeviceId } from "../shared/ids"
import {
  defaultPrefs,
  loadPrefs,
  savePrefs,
  type Prefs,
} from "../shared/prefs"
import { applyTheme } from "../shared/theme"
import { runP } from "./runtime"
import { QuoteList } from "./components/QuoteList"
import { SearchBar } from "./components/SearchBar"
import { SessionPanel } from "./components/SessionPanel"
import { SettingsView } from "./components/SettingsView"
import type { Quote, DeviceId } from "@focus-quote/shared"

const loadQuotes = (query: string) =>
  Effect.gen(function* () {
    const quotes = yield* QuotesService
    const list = query.trim()
      ? yield* quotes.search(query)
      : yield* quotes.list(10)
    return list as ReadonlyArray<Quote>
  })

const loadInitialPrefs = Effect.gen(function* () {
  const storage = yield* StorageService
  return yield* loadPrefs(storage)
})

const persistPrefs = (next: Prefs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* savePrefs(storage, next)
  })

type View = "main" | "settings"

export function App() {
  const [view, setView] = useState<View>("main")
  const [query, setQuery] = useState("")
  const [quotes, setQuotes] = useState<ReadonlyArray<Quote>>([])
  const [deviceId, setDeviceId] = useState<DeviceId | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs)

  const refresh = (q: string) =>
    runP(loadQuotes(q))
      .then(setQuotes)
      .catch((e) => console.error("[FocusQuote] load quotes:", e))

  useEffect(() => {
    runP(loadInitialPrefs)
      .then((p) => {
        setPrefs(p)
        applyTheme(p.theme)
      })
      .catch(console.error)
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

  const handlePrefsChange = (next: Prefs) => {
    setPrefs(next)
    runP(persistPrefs(next)).catch(console.error)
  }

  if (view === "settings") {
    return (
      <SettingsView
        prefs={prefs}
        onBack={() => setView("main")}
        onPrefsChange={handlePrefsChange}
      />
    )
  }

  return (
    <div class="flex flex-col gap-3 p-4">
      <header class="flex items-center justify-between">
        <h1 class="text-base font-semibold text-accent">FocusQuote</h1>
        <button
          type="button"
          onClick={() => setView("settings")}
          class="rounded p-1.5 opacity-70 transition hover:bg-card-light hover:opacity-100 dark:hover:bg-card-dark/60"
          aria-label="Settings"
        >
          <SettingsIcon size={14} />
        </button>
      </header>

      <SessionPanel
        defaultDurationMinutes={prefs.defaultDurationMinutes}
        defaultBreakMinutes={prefs.defaultBreakMinutes}
      />

      <SearchBar value={query} onInput={setQuery} />
      <QuoteList quotes={quotes} onDelete={handleDelete} />
    </div>
  )
}
