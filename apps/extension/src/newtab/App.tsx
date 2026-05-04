import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import { LogIn } from "lucide-preact"
import { QuotesService } from "../services/quotes"
import { SessionsService } from "../services/sessions"
import { StorageService } from "../services/storage"
import { AuthService } from "../services/auth"
import {
  applyTheme,
  loadTheme,
  saveTheme,
  TODAY_GOAL_KEY,
} from "../shared/theme"
import { runP } from "./runtime"
import type { Quote, Theme, User } from "@focus-quote/shared"
import { DailyQuote } from "./components/DailyQuote"
import { StatsRow } from "./components/StatsRow"
import { GoalEditor } from "./components/GoalEditor"
import { ThemeToggle } from "./components/ThemeToggle"

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

  const allQuotes = (yield* quotes.list()) as ReadonlyArray<Quote>
  const sessionStats = yield* sessions.stats
  const todayGoal = yield* storage.get<string>(TODAY_GOAL_KEY)

  return {
    user,
    randomQuote: pickRandom(allQuotes),
    stats: {
      todaySessions: sessionStats.todayCount,
      streak: sessionStats.streakDays,
      totalQuotes: allQuotes.length,
    } satisfies Stats,
    theme,
    todayGoal: todayGoal ?? "",
  }
})

const saveGoal = (value: string) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    if (value.trim()) {
      yield* storage.set(TODAY_GOAL_KEY, value)
    } else {
      yield* storage.remove(TODAY_GOAL_KEY)
    }
  })

const persistTheme = (theme: Theme) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* saveTheme(storage, theme)
  })

const greeting = () => {
  const hour = new Date().getHours()
  if (hour < 5) return "Late night"
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export function App() {
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

  const refresh = () =>
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
      .finally(() => setAuthReady(true))

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

  const handleToggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setTheme(next)
    applyTheme(next)
    runP(persistTheme(next)).catch(console.error)
  }

  const handleGoalChange = (value: string) => {
    setTodayGoal(value)
    runP(saveGoal(value)).catch(console.error)
  }

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
      <div class="flex min-h-screen items-center justify-center bg-bg-light text-text-light dark:bg-bg-dark dark:text-text-dark">
        <p class="text-sm opacity-60">Loading…</p>
      </div>
    )
  }

  return (
    <div class="min-h-screen bg-bg-light text-text-light transition dark:bg-bg-dark dark:text-text-dark">
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
        <header class="flex items-start justify-between">
          <div>
            <p class="text-sm uppercase tracking-wide opacity-60">
              {todayLabel}
            </p>
            <h1 class="mt-1 text-3xl font-semibold">{greeting()}.</h1>
          </div>
          <ThemeToggle theme={theme} onToggle={handleToggleTheme} />
        </header>

        {!user ? (
          <div class="rounded bg-card-light p-8 text-center shadow-sm dark:bg-card-dark/60 dark:shadow-none">
            <LogIn size={28} class="mx-auto mb-3 text-accent" />
            <h2 class="text-lg font-semibold">Sign in to FocusQuote</h2>
            <p class="mx-auto mt-2 max-w-md text-sm opacity-60">
              Click the FocusQuote icon in your toolbar to sign in. Your quotes
              and focus sessions will sync across all your devices.
            </p>
          </div>
        ) : (
          <>
            <GoalEditor goal={todayGoal} onChange={handleGoalChange} />
            <DailyQuote quote={randomQuote} />
            <StatsRow {...stats} />
          </>
        )}
      </div>
    </div>
  )
}
