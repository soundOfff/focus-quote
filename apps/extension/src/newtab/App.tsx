import { useCallback, useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import { LogIn } from "lucide-preact"
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
import { SessionsSection } from "./components/SessionsSection"
import { TopicsSection } from "./components/TopicsSection"
import { SessionDetail } from "./pages/SessionDetail"
import { useRoute } from "./router"
import { EmptyState, SkeletonCard } from "../ui/primitives"
import { AppShell } from "../ui/AppShell"
import { ToastProvider, useToast } from "../ui/Toast"

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
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}

function AppInner() {
  const route = useRoute()
  const toast = useToast()
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
      if (typeof msg !== "object" || msg === null) return
      const type = (msg as { type?: string }).type
      if (type === "focusquote.auth.signedIn") {
        refresh()
      } else if (type === "focusquote.session.finished") {
        toast.success("Focus session complete.")
        refresh()
      } else if (type === "focusquote.session.cancelled") {
        toast.info("Session cancelled.")
        refresh()
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [toast])

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
      <AppShell page="home" theme={theme} onToggleTheme={handleToggleTheme}>
        <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </div>
      </AppShell>
    )
  }

  if (user && route.name === "session-detail") {
    return <SessionDetail sessionId={route.sessionId} />
  }

  return (
    <AppShell page="home" theme={theme} onToggleTheme={handleToggleTheme}>
      <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <div class="flex shrink-0 flex-col gap-1 px-6 pt-8">
          <p class="text-xs uppercase tracking-wide text-mute">{todayLabel}</p>
          <h1 class="text-balance text-3xl font-bold text-ink">
            {greeting()}.
          </h1>
        </div>

        {!user ? (
          <div class="px-6 pb-8 pt-6">
            <EmptyState
              icon={<LogIn size={20} />}
              title="Sign in to FocusQuote"
              description="Click the FocusQuote toolbar icon to sign in. Quotes and focus sessions sync across your devices."
            />
          </div>
        ) : (
          <div class="flex min-h-0 flex-1 flex-col gap-5 px-6 pb-6 pt-5">
            <GoalEditor goal={todayGoal} onChange={handleGoalChange} />
            <DailyQuote quote={randomQuote} />
            <StatsRow {...stats} />
            <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
              <TopicsSection />
              <SessionsSection />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
