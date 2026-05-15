import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import { Settings as SettingsIcon } from "lucide-preact"
import { QuotesService } from "../services/quotes"
import { StorageService } from "../services/storage"
import { AuthService } from "../services/auth"
import { ApiService } from "../services/api"
import {
  defaultPrefs,
  ensurePrefsMigrated,
  loadPrefs,
  pullPrefsFromRemote,
  pushPrefsToRemote,
  savePrefs,
  type Prefs,
} from "../shared/prefs"
import {
  ensureProfileMigrated,
  loadProfilePrefs,
  pullProfileFromRemote,
  saveProfilePrefs,
} from "../shared/profile"
import { ensureOpenrouterMigrated } from "../shared/settings"
import { applyTheme } from "../shared/theme"
import { runP } from "./runtime"
import { AnalysisPanel } from "./components/AnalysisPanel"
import { QuoteList } from "./components/QuoteList"
import { SearchBar } from "./components/SearchBar"
import { SessionPanel } from "./components/SessionPanel"
import { SettingsView } from "./components/SettingsView"
import { SignIn } from "./components/SignIn"
import type { Quote, User } from "@focus-quote/shared"
import { Button, SkeletonCard } from "../ui/primitives"
import { ToastProvider, useToast } from "../ui/Toast"

const loadQuotes = (query: string) =>
  Effect.gen(function* () {
    const quotes = yield* QuotesService
    const list = query.trim()
      ? yield* quotes.search(query)
      : yield* quotes.list(10)
    return list as ReadonlyArray<Quote>
  })

const loadCachedPrefs = Effect.gen(function* () {
  const storage = yield* StorageService
  return yield* loadPrefs(storage)
})

const revalidatePrefs = Effect.gen(function* () {
  const storage = yield* StorageService
  // Run idempotent migrations before pulling, so legacy local prefs are
  // pushed up before we overwrite them with remote state.
  yield* ensurePrefsMigrated(storage)
  yield* ensureProfileMigrated(storage)
  yield* ensureOpenrouterMigrated(storage)
  return yield* pullPrefsFromRemote(storage)
})

const persistPrefs = (next: Prefs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* savePrefs(storage, next)
    yield* pushPrefsToRemote(next)
  })

const loadCurrentUser = Effect.gen(function* () {
  const auth = yield* AuthService
  return yield* auth.currentUser
})

const loadCachedProfilePhotoDataUrl = Effect.gen(function* () {
  const storage = yield* StorageService
  const profile = yield* loadProfilePrefs(storage)
  return profile.photoDataUrl
})

const revalidateProfilePhotoDataUrl = Effect.gen(function* () {
  const storage = yield* StorageService
  const api = yield* ApiService
  // Refresh profile from server (best-effort) so the photo id is current.
  let profile = yield* pullProfileFromRemote(storage).pipe(
    Effect.catchAll(() => loadProfilePrefs(storage)),
  )
  if (profile.photoMediaFileId && !profile.photoDataUrl) {
    const media = yield* api.getMedia(profile.photoMediaFileId).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    )
    if (media) {
      profile = {
        ...profile,
        photoDataUrl: `data:${media.file.mimeType};base64,${media.file.dataBase64}`,
      }
      yield* saveProfilePrefs(storage, profile)
    }
  }
  return profile.photoDataUrl
})

type View = "main" | "settings"

const openOptionsPage = () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage()
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/options/index.html") })
  }
}

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}

function AppInner() {
  const toast = useToast()
  const [view, setView] = useState<View>("main")
  const [query, setQuery] = useState("")
  const [quotes, setQuotes] = useState<ReadonlyArray<Quote>>([])
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs)
  const [user, setUser] = useState<User | null>(null)
  const [profilePhotoDataUrl, setProfilePhotoDataUrl] = useState("")
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
    // Paint from local cache immediately so the popup doesn't block on the
    // network. Then revalidate against the server in the background and
    // update state if anything changed.
    runP(loadCachedPrefs)
      .then((p) => {
        setPrefs(p)
        applyTheme(p.theme)
      })
      .catch(console.error)
      .finally(() => {
        runP(revalidatePrefs)
          .then((p) => {
            setPrefs(p)
            applyTheme(p.theme)
          })
          .catch(console.error)
      })

    runP(loadCachedProfilePhotoDataUrl)
      .then(setProfilePhotoDataUrl)
      .catch(() => {})
      .finally(() => {
        runP(revalidateProfilePhotoDataUrl)
          .then(setProfilePhotoDataUrl)
          .catch((e) =>
            console.error("[FocusQuote] revalidate profile photo:", e),
          )
      })

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
      if (typeof msg !== "object" || msg === null) return
      const type = (msg as { type?: string }).type
      if (type === "focusquote.auth.signedIn") refreshAuth()
      // Session start/finish/cancel toasts surface in the newtab navigator
      // (see newtab/App.tsx). The popup stays quiet to avoid duplicate
      // notifications when both surfaces are open.
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [toast])

  const handleDelete = (id: Quote["id"]) => {
    runP(
      Effect.gen(function* () {
        const quotes = yield* QuotesService
        yield* quotes.remove(id)
      }),
    )
      .then(() => {
        toast.success("Quote deleted.")
        refresh(query)
      })
      .catch((e) => {
        console.error(e)
        toast.error("Couldn't delete quote.")
      })
  }

  const handlePrefsChange = (next: Prefs) => {
    setPrefs(next)
    runP(persistPrefs(next)).catch(console.error)
  }

  if (!authReady) {
    return (
      <div class="h-[460px] w-[360px] bg-canvas text-body">
        <div class="flex h-full flex-col gap-3 p-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div class="h-[460px] w-[360px] overflow-y-auto bg-canvas text-body">
        <SignIn onSignedIn={refreshAuth} />
      </div>
    )
  }

  if (view === "settings") {
    return (
      <div class="h-[460px] w-[360px] overflow-y-auto bg-canvas text-body">
        <SettingsView
          prefs={prefs}
          user={user}
          profilePhotoDataUrl={profilePhotoDataUrl}
          onBack={() => setView("main")}
          onPrefsChange={handlePrefsChange}
          onSignedOut={() => setUser(null)}
        />
      </div>
    )
  }

  return (
    <div class="flex h-[460px] w-[360px] flex-col overflow-hidden bg-canvas text-body">
      <div class="flex shrink-0 flex-col gap-3 px-4 pb-2 pt-4">
        <header class="flex items-center justify-between">
          <h1 class="text-base font-semibold text-ink">FocusQuote</h1>
          <Button
            onClick={() => setView("settings")}
            variant="ghost"
            size="sm"
            aria-label="Settings"
          >
            <SettingsIcon size={14} />
          </Button>
        </header>

        <section class="flex flex-col gap-2">
          <h2 class="text-[10px] font-medium uppercase tracking-wider text-mute">
            Focus session
          </h2>
          <SessionPanel
            defaultDurationMinutes={prefs.defaultDurationMinutes}
            defaultBreakMinutes={prefs.defaultBreakMinutes}
          />
          <AnalysisPanel />
        </section>

        <h2 class="mt-1 text-[10px] font-medium uppercase tracking-wider text-mute">
          Saved quotes
        </h2>
        <SearchBar value={query} onInput={setQuery} />
      </div>

      <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
        <QuoteList quotes={quotes} onDelete={handleDelete} />
      </div>
    </div>
  )
}
