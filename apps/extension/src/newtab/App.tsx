import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import { QuotesService } from "../services/quotes"
import { SessionsService } from "../services/sessions"
import { StorageService } from "../services/storage"
import { applyTheme, loadTheme, saveTheme, TODAY_GOAL_KEY } from "../shared/theme"
import { runP } from "./runtime"
import type { Quote, Theme } from "@focus-quote/shared"
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
  arr.length === 0 ? null : (arr[Math.floor(Math.random() * arr.length)] ?? null)

const loadAll = Effect.gen(function* () {
  const quotes = yield* QuotesService
  const sessions = yield* SessionsService
  const storage = yield* StorageService

  const allQuotes = (yield* quotes.list()) as ReadonlyArray<Quote>
  const sessionStats = yield* sessions.stats
  const theme = yield* loadTheme(storage)
  const todayGoal = yield* storage.get<string>(TODAY_GOAL_KEY)

  return {
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
  const [randomQuote, setRandomQuote] = useState<Quote | null>(null)
  const [stats, setStats] = useState<Stats>({
    todaySessions: 0,
    streak: 0,
    totalQuotes: 0,
  })
  const [theme, setTheme] = useState<Theme>("dark")
  const [todayGoal, setTodayGoal] = useState("")

  useEffect(() => {
    runP(loadAll)
      .then((s) => {
        setRandomQuote(s.randomQuote)
        setStats(s.stats)
        setTheme(s.theme)
        setTodayGoal(s.todayGoal)
        applyTheme(s.theme)
      })
      .catch((e) => console.error("[FocusQuote] newtab load:", e))
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

        <GoalEditor goal={todayGoal} onChange={handleGoalChange} />
        <DailyQuote quote={randomQuote} />
        <StatsRow {...stats} />
      </div>
    </div>
  )
}
