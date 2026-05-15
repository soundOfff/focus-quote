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
    <div class="flex flex-col gap-4 bg-canvas p-4 text-body">
      <header class="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          class="rounded-md p-1.5 text-mute transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70"
          aria-label="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <h2 class="text-base font-semibold text-ink">Settings</h2>
      </header>

      <Section label="Account">
        <div class="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface px-3 py-2">
          <div class="min-w-0">
            <div class="truncate text-sm font-medium text-ink">
              {user.name ?? user.email}
            </div>
            {user.name && (
              <div class="truncate text-xs text-mute">{user.email}</div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            class="flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-hairline px-2.5 py-1 text-xs font-medium text-body transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70"
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
          class="mt-2 flex min-h-8 w-full items-center justify-center gap-2 rounded-md border border-hairline px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-surface-soft disabled:opacity-40"
        >
          <RefreshCw size={12} class={busy ? "animate-spin" : undefined} />
          Sync now
        </button>
      </Section>

      <button
        type="button"
        onClick={openOptions}
        class="flex min-h-10 items-center justify-between rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-body transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70"
      >
        <span>Open full options</span>
        <ExternalLink size={14} class="text-mute" />
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
      <h3 class="text-[10px] uppercase tracking-wider text-mute">{label}</h3>
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
      class={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70 ${
        active
          ? "border-primary bg-primary text-ink"
          : "border-hairline bg-surface text-body hover:bg-surface-soft"
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
    <label class="flex flex-col gap-1 rounded-md border border-hairline bg-surface px-3 py-2">
      <span class="text-[10px] uppercase tracking-wider text-mute">
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
        class="w-full bg-transparent text-base tabular-nums text-ink outline-none focus:ring-0"
      />
    </label>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div class="rounded-md border border-hairline bg-surface px-2 py-2">
      <div class="text-base font-medium tabular-nums text-ink">{value}</div>
      <div class="text-[10px] uppercase tracking-wider text-mute">{label}</div>
    </div>
  )
}
