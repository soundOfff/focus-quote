import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import {
  Flame,
  Settings as SettingsIcon,
  Target as TargetIcon,
} from "lucide-preact"
import { QuotesService } from "../services/quotes"
import { SessionsService } from "../services/sessions"
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
import { applyTheme, loadTodayGoal } from "../shared/theme"
import { runP } from "./runtime"
import { useAnalysisInsight } from "./components/AnalysisPanel"
import { QuoteList } from "./components/QuoteList"
import { SearchBar } from "./components/SearchBar"
import { SessionPanel } from "./components/SessionPanel"
import { SettingsView } from "./components/SettingsView"
import { SignIn } from "./components/SignIn"
import type { Quote, User } from "@focus-quote/shared"
import { MonoLabel, SkeletonCard } from "../ui/primitives"
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

const loadPopupExtras = Effect.gen(function* () {
  const storage = yield* StorageService
  const sessions = yield* SessionsService
  const quotes = yield* QuotesService
  const [todayGoal, sessionStats, allQuotes] = yield* Effect.all([
    loadTodayGoal(storage),
    sessions.stats,
    quotes.list(),
  ])
  return {
    todayGoal,
    streak: sessionStats.streakDays,
    todayCount: sessionStats.todayCount,
    totalQuotes: allQuotes.length,
  }
})

type View = "main" | "settings"

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
  const [todayGoal, setTodayGoal] = useState("")
  const [streak, setStreak] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [totalQuotes, setTotalQuotes] = useState(0)

  // AnalysisPanel collapsed into a hook — its insight line piggy-backs on
  // the Today's Intent band so the popup keeps just four primary regions.
  const analysis = useAnalysisInsight()

  const refresh = (q: string) =>
    runP(loadQuotes(q))
      .then((next) => {
        setQuotes(next)
        setTotalQuotes(next.length)
      })
      .catch((e) => console.error("[FocusQuote] load quotes:", e))

  const refreshAuth = () =>
    runP(loadCurrentUser)
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true))

  const refreshExtras = () =>
    runP(loadPopupExtras)
      .then((s) => {
        setTodayGoal(s.todayGoal)
        setStreak(s.streak)
        setTodayCount(s.todayCount)
        setTotalQuotes(s.totalQuotes)
      })
      .catch(() => {})

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
    refreshExtras()
  }, [user])

  useEffect(() => {
    if (!user) return
    const t = setTimeout(() => refresh(query), 120)
    return () => clearTimeout(t)
  }, [query, user])

  // Listen for auth-callback broadcasting a sign-in. Session start/finish/
  // cancel toasts surface in the newtab navigator (see newtab/App.tsx); the
  // popup stays quiet to avoid duplicate notifications.
  useEffect(() => {
    const onMessage = (msg: unknown) => {
      if (typeof msg !== "object" || msg === null) return
      const type = (msg as { type?: string }).type
      if (type === "focusquote.auth.signedIn") refreshAuth()
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [toast])

  const handleDelete = (id: Quote["id"]) => {
    runP(
      Effect.gen(function* () {
        const quotesSvc = yield* QuotesService
        yield* quotesSvc.remove(id)
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

  // EEE · MMM d, uppercase — matches `FRI · MAY 15` in the handoff.
  const dateLabel = useMemo(() => {
    const d = new Date()
    const weekday = d
      .toLocaleDateString(undefined, { weekday: "short" })
      .toUpperCase()
      .replace(/\.$/, "")
    const month = d
      .toLocaleDateString(undefined, { month: "short" })
      .toUpperCase()
      .replace(/\.$/, "")
    return `${weekday} · ${month} ${d.getDate()}`
  }, [])

  if (!authReady) {
    return (
      <div class="flex min-h-[460px] w-[380px] flex-col bg-paper text-ink-2">
        <div class="flex flex-1 flex-col gap-3 p-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div class="min-h-[460px] w-[380px] overflow-y-auto bg-paper text-ink-2">
        <SignIn onSignedIn={refreshAuth} />
      </div>
    )
  }

  if (view === "settings") {
    return (
      <div class="min-h-[460px] w-[380px] overflow-y-auto bg-paper text-ink-2">
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
    <div class="flex max-h-[760px] min-h-[460px] w-[380px] flex-col overflow-hidden bg-paper text-ink-2">
      {/* 1. Header bar */}
      <header class="flex shrink-0 items-center justify-between border-b border-rule px-4 pb-3 pt-[14px]">
        <div class="flex items-baseline gap-2">
          <h1 class="font-serif text-[18px] font-semibold tracking-[-0.01em] text-ink">
            Focus<span class="text-amber-deep">Quote</span>
          </h1>
          <span class="font-mono text-[9.5px] uppercase tracking-mono-wide text-muted-2">
            {dateLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setView("settings")}
          aria-label="Settings"
          class="rounded-chip p-[6px] text-muted transition-colors hover:bg-paper-2 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep/40"
        >
          <SettingsIcon size={14} strokeWidth={1.7} />
        </button>
      </header>

      {/* 2. Today's intent band */}
      <section class="shrink-0 border-b border-rule bg-paper-2 px-4 pb-[6px] pt-3">
        <div class="mb-1 flex items-center gap-[6px] text-blue-ink">
          <TargetIcon size={11} strokeWidth={2} aria-hidden />
          <MonoLabel tone="info" class="leading-none">
            Today's intent
          </MonoLabel>
        </div>
        <p class="mb-2 text-[13px] font-medium leading-[1.4] text-ink-2">
          {todayGoal?.trim() || (
            <span class="text-muted-2">
              Set an intent for today on the new tab.
            </span>
          )}
        </p>
        {analysis.insightLine && (
          <p class="mb-2 text-[11.5px] italic leading-[1.45] text-muted">
            {analysis.insightLine}
          </p>
        )}
      </section>

      {/* 3. Focus session */}
      <section class="flex shrink-0 flex-col gap-3 px-4 pb-4 pt-[14px]">
        <SessionPanel
          defaultDurationMinutes={prefs.defaultDurationMinutes}
          defaultBreakMinutes={prefs.defaultBreakMinutes}
          onChange={refreshExtras}
        />
        <StatsLine
          streak={streak}
          today={todayCount}
          totalQuotes={totalQuotes}
        />
      </section>

      {/* 4. Saved quotes drawer */}
      <section class="flex min-h-0 flex-1 flex-col border-t border-rule bg-paper-2">
        <header class="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
          <div class="flex items-baseline gap-2">
            <MonoLabel>Saved quotes</MonoLabel>
            <span class="font-mono text-[10.5px] text-muted-2">
              · {totalQuotes}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              chrome.tabs.create({
                url: chrome.runtime.getURL("src/newtab/index.html"),
              })
            }
            class="inline-flex items-center gap-1 text-[11px] font-medium text-blue-ink transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep/40"
          >
            All <span aria-hidden>→</span>
          </button>
        </header>
        <div class="shrink-0 px-3 pb-1">
          <SearchBar value={query} onInput={setQuery} />
        </div>
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 pt-2">
          <QuoteList quotes={quotes} onDelete={handleDelete} />
        </div>
      </section>
    </div>
  )
}

function StatsLine({
  streak,
  today,
  totalQuotes,
}: {
  streak: number
  today: number
  totalQuotes: number
}) {
  return (
    <div class="flex items-center gap-[10px] text-[11.5px] text-muted">
      <span class="inline-flex items-center gap-[5px]">
        <Flame size={12} strokeWidth={1.8} class="text-amber-deep" aria-hidden />
        <strong class="font-semibold text-ink-2">{streak}</strong> day streak
      </span>
      <span
        aria-hidden
        class="inline-block h-[3px] w-[3px] rounded-pill bg-muted-2"
      />
      <span>
        <strong class="font-semibold text-ink-2">{today}</strong> today
      </span>
      <span
        aria-hidden
        class="inline-block h-[3px] w-[3px] rounded-pill bg-muted-2"
      />
      <span>
        <strong class="font-semibold text-ink-2">{totalQuotes}</strong> quotes
      </span>
    </div>
  )
}
