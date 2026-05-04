import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import {
  ArrowLeft,
  ExternalLink,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-preact"
import { StorageService } from "../../services/storage"
import { SyncService } from "../../services/sync"
import { QuotesService } from "../../services/quotes"
import { SessionsService } from "../../services/sessions"
import { AuthService } from "../../services/auth"
import type { Prefs } from "../../shared/prefs"
import { applyTheme } from "../../shared/theme"
import type { Theme, User } from "@focus-quote/shared"
import { runP } from "../runtime"

interface Stats {
  quotes: number
  sessions: number
  queued: number
}

const loadStats: Effect.Effect<
  Stats,
  unknown,
  StorageService | SyncService | QuotesService | SessionsService
> = Effect.gen(function* () {
  const quotes = yield* QuotesService
  const sessions = yield* SessionsService
  const sync = yield* SyncService
  const allQuotes = yield* quotes.list()
  const sessionStats = yield* sessions.stats
  const queued = yield* sync.queueSize.pipe(
    Effect.catchAll(() => Effect.succeed(0)),
  )
  return {
    quotes: allQuotes.length,
    sessions: sessionStats.totalCompleted,
    queued,
  }
})

interface Props {
  prefs: Prefs
  user: User
  onBack: () => void
  onPrefsChange: (next: Prefs) => void
  onSignedOut: () => void
}

export function SettingsView({
  prefs,
  user,
  onBack,
  onPrefsChange,
  onSignedOut,
}: Props) {
  const [stats, setStats] = useState<Stats>({ quotes: 0, sessions: 0, queued: 0 })
  const [busy, setBusy] = useState(false)

  const refreshStats = () =>
    runP(loadStats).then(setStats).catch(() => {})

  useEffect(() => {
    refreshStats()
  }, [])

  const setTheme = (theme: Theme) => {
    applyTheme(theme)
    onPrefsChange({ ...prefs, theme })
  }

  const setDuration = (n: number) => {
    const clamped = Math.max(1, Math.min(180, Math.floor(n) || prefs.defaultDurationMinutes))
    onPrefsChange({ ...prefs, defaultDurationMinutes: clamped })
  }

  const setBreak = (n: number) => {
    const clamped = Math.max(0, Math.min(60, Math.floor(n) || 0))
    onPrefsChange({ ...prefs, defaultBreakMinutes: clamped })
  }

  const handleSyncNow = () => {
    setBusy(true)
    runP(
      Effect.gen(function* () {
        const sync = yield* SyncService
        return yield* sync.drain
      }),
    )
      .then(() => refreshStats())
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage()
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL("src/options/index.html") })
    }
  }

  const handleSignOut = () => {
    runP(
      Effect.gen(function* () {
        const auth = yield* AuthService
        yield* auth.signOut
      }),
    )
      .then(() => onSignedOut())
      .catch(() => onSignedOut())
  }

  return (
    <div class="flex flex-col gap-4 p-4">
      <header class="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          class="rounded p-1.5 opacity-70 transition hover:bg-card-light hover:opacity-100 dark:hover:bg-card-dark/60"
          aria-label="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <h2 class="text-base font-semibold">Settings</h2>
      </header>

      <Section label="Account">
        <div class="flex items-center justify-between gap-3 rounded bg-card-light px-3 py-2 shadow-sm dark:bg-card-dark dark:shadow-none">
          <div class="min-w-0">
            <div class="truncate text-sm font-medium">
              {user.name ?? user.email}
            </div>
            {user.name && (
              <div class="truncate text-xs opacity-60">{user.email}</div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            class="flex shrink-0 items-center gap-1 rounded border border-accent/40 px-2 py-1 text-xs text-accent transition hover:bg-accent/10"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      </Section>

      <Section label="Appearance">
        <div class="flex gap-2">
          <ThemeOption
            active={prefs.theme === "dark"}
            onClick={() => setTheme("dark")}
            icon={<Moon size={14} />}
            label="Dark"
          />
          <ThemeOption
            active={prefs.theme === "light"}
            onClick={() => setTheme("light")}
            icon={<Sun size={14} />}
            label="Light"
          />
        </div>
      </Section>

      <Section label="Session defaults">
        <div class="grid grid-cols-2 gap-2">
          <NumberField
            label="Focus (min)"
            min={1}
            max={180}
            value={prefs.defaultDurationMinutes}
            onChange={setDuration}
          />
          <NumberField
            label="Break (min)"
            min={0}
            max={60}
            value={prefs.defaultBreakMinutes}
            onChange={setBreak}
          />
        </div>
      </Section>

      <Section label="Storage">
        <div class="grid grid-cols-3 gap-2 text-center">
          <Stat value={stats.quotes} label="Quotes" />
          <Stat value={stats.sessions} label="Sessions" />
          <Stat value={stats.queued} label="Queued" />
        </div>
        <button
          type="button"
          onClick={handleSyncNow}
          disabled={busy}
          class="mt-2 flex w-full items-center justify-center gap-2 rounded border border-accent/40 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-40"
        >
          <RefreshCw size={12} class={busy ? "animate-spin" : undefined} />
          Sync now
        </button>
      </Section>

      <button
        type="button"
        onClick={openOptions}
        class="flex items-center justify-between rounded bg-card-light px-3 py-2 text-sm shadow-sm transition hover:bg-card-light/70 dark:bg-card-dark dark:shadow-none dark:hover:bg-card-dark/80"
      >
        <span>Open full options</span>
        <ExternalLink size={14} class="opacity-60" />
      </button>
    </div>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: preact.ComponentChildren
}) {
  return (
    <section class="flex flex-col gap-2">
      <h3 class="text-[10px] uppercase tracking-wider opacity-50">{label}</h3>
      {children}
    </section>
  )
}

function ThemeOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: preact.ComponentChildren
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm transition ${
        active
          ? "bg-accent text-white"
          : "bg-card-light text-text-light hover:bg-card-light/70 dark:bg-card-dark dark:text-text-dark dark:hover:bg-card-dark/80"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <label class="flex flex-col gap-1 rounded bg-card-light px-3 py-2 shadow-sm dark:bg-card-dark dark:shadow-none">
      <span class="text-[10px] uppercase tracking-wider opacity-60">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onInput={(e) =>
          onChange(Number((e.currentTarget as HTMLInputElement).value))
        }
        class="w-full bg-transparent text-base tabular-nums focus:outline-none"
      />
    </label>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div class="rounded bg-card-light px-2 py-2 shadow-sm dark:bg-card-dark dark:shadow-none">
      <div class="text-base font-medium tabular-nums">{value}</div>
      <div class="text-[10px] uppercase tracking-wider opacity-60">{label}</div>
    </div>
  )
}
