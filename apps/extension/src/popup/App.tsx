import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import { Settings as SettingsIcon } from "lucide-preact"
import { QuotesService } from "../services/quotes"
import { StorageService } from "../services/storage"
import { AuthService } from "../services/auth"
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
import { SignIn } from "./components/SignIn"
import type { Quote, User } from "@focus-quote/shared"

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

const loadCurrentUser = Effect.gen(function* () {
  const auth = yield* AuthService
  return yield* auth.currentUser
})

type View = "main" | "settings"

export function App() {
  const [view, setView] = useState<View>("main")
  const [query, setQuery] = useState("")
  const [quotes, setQuotes] = useState<ReadonlyArray<Quote>>([])
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs)
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)

  const refresh = (q: string) =>
    runP(loadQuotes(q))
      .then(setQuotes)
      .catch((e) => console.error("[FocusQuote] load quotes:", e))

  const refreshAuth = () =>
    runP(loadCurrentUser)
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true))

  useEffect(() => {
    runP(loadInitialPrefs)
      .then((p) => {
        setPrefs(p)
        applyTheme(p.theme)
      })
      .catch(console.error)
    refreshAuth()
  }, [])

  useEffect(() => {
    if (!user) return
    refresh(query)
  }, [user])

  useEffect(() => {
    if (!user) return
    const t = setTimeout(() => refresh(query), 120)
    return () => clearTimeout(t)
  }, [query, user])

  // listen for the auth-callback page broadcasting a successful sign-in
  useEffect(() => {
    const onMessage = (msg: unknown) => {
      if (
        typeof msg === "object" &&
        msg !== null &&
        (msg as { type?: string }).type === "focusquote.auth.signedIn"
      ) {
        refreshAuth()
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [])

  const handleDelete = (id: Quote["id"]) => {
    runP(
      Effect.gen(function* () {
        const quotes = yield* QuotesService
        yield* quotes.remove(id)
      }),
    )
      .then(() => refresh(query))
      .catch(console.error)
  }

  const handlePrefsChange = (next: Prefs) => {
    setPrefs(next)
    runP(persistPrefs(next)).catch(console.error)
  }

  if (!authReady) {
    return (
      <div class="flex min-h-[200px] items-center justify-center p-6 text-sm opacity-60">
        Loading…
      </div>
    )
  }

  if (!user) {
    return <SignIn onSignedIn={refreshAuth} />
  }

  if (view === "settings") {
    return (
      <SettingsView
        prefs={prefs}
        user={user}
        onBack={() => setView("main")}
        onPrefsChange={handlePrefsChange}
        onSignedOut={() => setUser(null)}
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
