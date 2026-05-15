import { useCallback, useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import { LogIn, Settings } from "lucide-preact"
import { QuotesService } from "../services/quotes"
import { SessionsService } from "../services/sessions"
import { StorageService } from "../services/storage"
import { ApiService } from "../services/api"
import { AuthService } from "../services/auth"
import {
  applyTheme,
  loadTheme,
  loadTodayGoal,
  saveTheme,
  saveTodayGoal,
} from "../shared/theme"
import {
  ensurePrefsMigrated,
  pullPrefsFromRemote,
  pushPrefsToRemote,
} from "../shared/prefs"
import { runP } from "./runtime"
import type { Quote, Theme, User } from "@focus-quote/shared"
import { DailyQuote } from "./components/DailyQuote"
import { StatsRow } from "./components/StatsRow"
import { GoalEditor } from "./components/GoalEditor"
import { ThemeToggle } from "./components/ThemeToggle"
import { SessionsSection } from "./components/SessionsSection"
import { TopicsSection } from "./components/TopicsSection"
import { SessionDetail } from "./pages/SessionDetail"
import { useRoute } from "./router"
import { EmptyState } from "../ui/primitives"

interface Stats {
  todaySessions: number
  streak: number
  totalQuotes: number
}

const pickRandom = <T,>(arr: ReadonlyArray<T>): T | null =>
  arr.length === 0
    ? null
    : (arr[Math.floor(Math.random() * arr.length)] ?? null)

const loadAll = Effect.gen(function* () {
  const quotes = yield* QuotesService
  const sessions = yield* SessionsService
  const storage = yield* StorageService
  const api = yield* ApiService
  const auth = yield* AuthService

  const user = yield* auth.currentUser
  const theme = yield* loadTheme(storage)

  if (!user) {
    return {
      user: null,
      randomQuote: null,
      stats: {
        todaySessions: 0,
        streak: 0,
        totalQuotes: 0,
      } satisfies Stats,
      theme,
      todayGoal: "",
    }
  }

  // Pull authoritative settings on each newtab load. Cached locally for
  // instant subsequent paints; network failures fall back to local state.
  yield* ensurePrefsMigrated(storage)
  const remotePrefs = yield* pullPrefsFromRemote(storage)

  const allQuotes = (yield* quotes.list()) as ReadonlyArray<Quote>
  const sessionStats = yield* sessions.stats
  const todayGoal = yield* loadTodayGoal(storage)

  return {
    user,
    randomQuote: pickRandom(allQuotes),
    stats: {
      todaySessions: sessionStats.todayCount,
      streak: sessionStats.streakDays,
      totalQuotes: allQuotes.length,
    } satisfies Stats,
    theme: remotePrefs.theme,
    todayGoal,
  }
})

const saveGoal = (value: string) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* saveTodayGoal(storage, value)
  })

const persistTheme = (theme: Theme) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* saveTheme(storage, theme)
    const prefs = yield* pullPrefsFromRemote(storage).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    )
    if (prefs) yield* pushPrefsToRemote({ ...prefs, theme })
  })

const greeting = () => {
  const hour = new Date().getHours()
  if (hour < 5) return "Late night"
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export function App() {
  const route = useRoute()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [randomQuote, setRandomQuote] = useState<Quote | null>(null)
  const [stats, setStats] = useState<Stats>({
    todaySessions: 0,
    streak: 0,
    totalQuotes: 0,
  })
  const [theme, setTheme] = useState<Theme>("dark")
  const [todayGoal, setTodayGoal] = useState("")

  const refresh = useCallback(
    () =>
    runP(loadAll)
      .then((s) => {
        setUser(s.user)
        setRandomQuote(s.randomQuote)
        setStats(s.stats)
        setTheme(s.theme)
        setTodayGoal(s.todayGoal)
        applyTheme(s.theme)
      })
      .catch((e) => console.error("[FocusQuote] newtab load:", e))
      .finally(() => setAuthReady(true)),
    [],
  )

  useEffect(() => {
    refresh()
    const onMessage = (msg: unknown) => {
      if (
        typeof msg === "object" &&
        msg !== null &&
        (msg as { type?: string }).type === "focusquote.auth.signedIn"
      ) {
        refresh()
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [])

  const handleToggleTheme = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setTheme(next)
    applyTheme(next)
    runP(persistTheme(next)).catch(console.error)
  }, [theme])

  const handleGoalChange = useCallback((value: string) => {
    setTodayGoal(value)
    runP(saveGoal(value)).catch(console.error)
  }, [])

  const handleOpenOptions = useCallback(() => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage()
    } else {
      chrome.tabs.create({
        url: chrome.runtime.getURL("src/options/index.html"),
      })
    }
  }, [])

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [],
  )

  if (!authReady) {
    return (
      <div class="flex min-h-screen items-center justify-center bg-canvas text-body">
        <p class="text-sm opacity-60">Loading…</p>
      </div>
    )
  }

  if (user && route.name === "session-detail") {
    return <SessionDetail sessionId={route.sessionId} />
  }

  return (
    <div class="min-h-screen bg-canvas text-body">
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
        <header class="flex items-start justify-between">
          <div>
            <p class="text-xs uppercase tracking-wide text-mute">
              {todayLabel}
            </p>
            <h1 class="mt-1 text-balance text-3xl font-bold text-ink">
              {greeting()}.
            </h1>
          </div>
          <div class="flex items-center gap-1">
            <ThemeToggle theme={theme} onToggle={handleToggleTheme} />
            {user ? (
              <button
                type="button"
                onClick={handleOpenOptions}
                aria-label="Open full options"
                class="rounded-md p-2 text-mute transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70"
              >
                <Settings size={16} />
              </button>
            ) : null}
          </div>
        </header>

        {!user ? (
          <EmptyState
            icon={<LogIn size={20} />}
            title="Sign in to FocusQuote"
            description="Click the FocusQuote toolbar icon to sign in. Quotes and focus sessions sync across your devices."
          />
        ) : (
          <>
            <GoalEditor goal={todayGoal} onChange={handleGoalChange} />
            <DailyQuote quote={randomQuote} />
            <StatsRow {...stats} />
            <TopicsSection />
            <SessionsSection />
          </>
        )}
      </div>
    </div>
  )
}
