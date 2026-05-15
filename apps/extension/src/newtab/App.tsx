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
import type { Quote, Session, Theme, User } from "@focus-quote/shared"
import { DailyQuote } from "./components/DailyQuote"
import { GoalEditor } from "./components/GoalEditor"
import { SessionsSection } from "./components/SessionsSection"
import { TopicsSection } from "./components/TopicsSection"
import { SessionDetail } from "./pages/SessionDetail"
import { useRoute } from "./router"
import { EmptyState, SkeletonCard } from "../ui/primitives"
import { AppShell } from "../ui/AppShell"
import { ToastProvider, useToast } from "../ui/Toast"
import { HomeSubNav, type HomeMainTab } from "./components/HomeSubNav"
import { HomeSidebar } from "./components/HomeSidebar"
import { RecentSessionCards } from "./components/RecentSessionCards"
import { HomeQuotesPanel } from "./components/HomeQuotesPanel"
import { HomeArchivePanel } from "./components/HomeArchivePanel"

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
      recentSessions: [] as Session[],
    }
  }

  yield* ensurePrefsMigrated(storage)
  const remotePrefs = yield* pullPrefsFromRemote(storage)

  const allQuotes = (yield* quotes.list()) as ReadonlyArray<Quote>
  const sessionStats = yield* sessions.stats
  const recentSessions = yield* sessions.list(12)
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
    recentSessions,
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
  if (hour < 5) return "Good evening"
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

const displayFirstName = (user: User) => {
  const raw = (() => {
    const n = user.name?.trim()
    if (n) return n.split(/\s+/)[0] ?? n
    const e = user.email?.trim()
    if (e && e.includes("@")) return e.split("@")[0] ?? "there"
    return "there"
  })()
  if (!raw || raw === "there") return raw
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

const subtextForStats = (s: Stats) => {
  if (s.todaySessions >= 2)
    return `Two sessions in already. Keep the streak alive with one more focused block before the day closes out.`
  if (s.todaySessions === 1)
    return `Nice start — one focused block down. Room for another before the day ends.`
  return `Start a focus block when you’re ready — small sessions compound.`
}

const HEADER_TAB_KEY = "focusquote.home.mainTab"

const isHomeMainTab = (v: unknown): v is HomeMainTab =>
  v === "overview" ||
  v === "sessions" ||
  v === "quotes" ||
  v === "topics" ||
  v === "archive"

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
  const [recentSessions, setRecentSessions] = useState<ReadonlyArray<Session>>(
    [],
  )
  const [theme, setTheme] = useState<Theme>("dark")
  const [todayGoal, setTodayGoal] = useState("")
  const [homeTab, setHomeTab] = useState<HomeMainTab>("overview")

  useEffect(() => {
    chrome.storage?.local?.get(HEADER_TAB_KEY).then((res) => {
      const v = res?.[HEADER_TAB_KEY]
      if (isHomeMainTab(v)) setHomeTab(v)
    }).catch(() => {})
  }, [])

  const setHomeTabPersist = (next: HomeMainTab) => {
    setHomeTab(next)
    chrome.storage?.local?.set({ [HEADER_TAB_KEY]: next }).catch(() => {})
  }

  const refresh = useCallback(
    () =>
      runP(loadAll)
        .then((s) => {
          setUser(s.user)
          setRandomQuote(s.randomQuote)
          setStats(s.stats)
          setTheme(s.theme)
          setTodayGoal(s.todayGoal)
          setRecentSessions(s.recentSessions)
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

  const shortHeaderDate = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).toUpperCase(),
    [],
  )

  /** Matches mock: "FRIDAY, MAY 15" */
  const overviewDateLabel = useMemo(
    () =>
      new Date()
        .toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
        .toUpperCase(),
    [],
  )

  if (!authReady) {
    return (
      <AppShell
        page="home"
        theme={theme}
        onToggleTheme={handleToggleTheme}
        headerDate={shortHeaderDate}
      >
        <div class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-8 sm:px-6">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </div>
      </AppShell>
    )
  }

  // Keep the Home subtree mounted at all times once signed in, and overlay
  // SessionDetail on top for the detail route. Returning an entirely different
  // tree for `session-detail` used to unmount AppShell + Home, so clicking
  // Back re-mounted Home and triggered fresh fetches in TopicsSection /
  // SessionsSection — which read as a full page reload.
  const onSessionDetail = user !== null && route.name === "session-detail"

  return (
    <AppShell
      page={onSessionDetail ? "session-detail" : "home"}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      headerDate={shortHeaderDate}
    >
      <div
        class={`mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 sm:px-6 ${
          onSessionDetail ? "hidden" : ""
        }`}
        aria-hidden={onSessionDetail}
      >
        {!user ? (
          <div class="flex flex-1 flex-col justify-center py-10">
            <EmptyState
              icon={<LogIn size={20} />}
              title="Sign in to FocusQuote"
              description="Click the FocusQuote toolbar icon to sign in. Quotes and focus sessions sync across your devices."
            />
          </div>
        ) : (
          <>
            <div class="shrink-0 pt-5">
              <HomeSubNav value={homeTab} onChange={setHomeTabPersist} />
            </div>
            <div class="flex min-h-0 flex-1 flex-col gap-6 py-5 lg:flex-row lg:gap-10 lg:py-6">
              <HomeSidebar
                metrics={stats}
                onJumpToTopics={() => setHomeTabPersist("topics")}
              />
              <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pb-6 pr-2  ">
                {homeTab === "overview" && (
                  <>
                    <header class="mb-5 shrink-0 space-y-1">
                      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">
                        {overviewDateLabel}
                      </p>
                      <h1 class="font-serif text-balance text-3xl font-bold tracking-tight text-ink">
                        {greeting()}, {displayFirstName(user)}.
                      </h1>
                      <p class="max-w-prose text-sm leading-relaxed text-mute">
                        {subtextForStats(stats)}
                      </p>
                    </header>
                    <div class="flex flex-col gap-6">
                      <GoalEditor goal={todayGoal} onChange={handleGoalChange} />
                      <DailyQuote quote={randomQuote} />
                      <section>
                        <div class="mb-3 flex items-baseline justify-between gap-2">
                          <h2 class="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">
                            Recent sessions
                          </h2>
                          <button
                            type="button"
                            onClick={() => setHomeTabPersist("archive")}
                            class="text-[10px] font-semibold uppercase tracking-wide text-link-blue transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70"
                          >
                            View archive →
                          </button>
                        </div>
                        {recentSessions.length === 0 ? (
                          <EmptyState
                            title="No sessions yet"
                            description="Start one from the toolbar — your timeline will fill in here."
                          />
                        ) : (
                          <RecentSessionCards sessions={recentSessions} />
                        )}
                      </section>
                    </div>
                  </>
                )}
                {homeTab === "sessions" && (
                  <div class="flex flex-col gap-4 pt-1">
                    <h1 class="text-xl font-bold text-ink">Sessions</h1>
                    <SessionsSection />
                  </div>
                )}
                {homeTab === "quotes" && (
                  <div class="flex flex-col gap-4 pt-1">
                    <h1 class="text-xl font-bold text-ink">Quotes</h1>
                    <HomeQuotesPanel />
                  </div>
                )}
                {homeTab === "topics" && (
                  <div class="flex flex-col gap-4 pt-1">
                    <h1 class="text-xl font-bold text-ink">Topics</h1>
                    <TopicsSection />
                  </div>
                )}
                {homeTab === "archive" && (
                  <div class="flex flex-col gap-4 pt-1">
                    <h1 class="text-xl font-bold text-ink">Archive</h1>
                    <HomeArchivePanel />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {onSessionDetail && route.name === "session-detail" && (
        <SessionDetail sessionId={route.sessionId} />
      )}
    </AppShell>
  )
}
