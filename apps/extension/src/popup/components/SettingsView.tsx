import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LogOut,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Sun,
} from "lucide-preact"
import { StorageService } from "../../services/storage"
import { SyncService } from "../../services/sync"
import { QuotesService } from "../../services/quotes"
import { SessionsService } from "../../services/sessions"
import { AuthService } from "../../services/auth"
import type { Prefs } from "../../shared/prefs"
import { resolveAccountImageSrc } from "../../shared/profile"
import { applyTheme } from "../../shared/theme"
import { TRANSLATE_LANGUAGES } from "../../shared/translation"
import type { Theme, User } from "@focus-quote/shared"
import { NativeSelect } from "../../ui/primitives"
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
  profilePhotoDataUrl: string
  onBack: () => void
  onPrefsChange: (next: Prefs) => void
  onSignedOut: () => void
}

export function SettingsView({
  prefs,
  user,
  profilePhotoDataUrl,
  onBack,
  onPrefsChange,
  onSignedOut,
}: Props) {
  const [stats, setStats] = useState<Stats>({ quotes: 0, sessions: 0, queued: 0 })
  const [busy, setBusy] = useState(false)
  const [syncState, setSyncState] = useState<"idle" | "success" | "error">("idle")
  const [syncMessage, setSyncMessage] = useState("")
  const accountImageSrc = resolveAccountImageSrc(profilePhotoDataUrl, user.image)
  const accountEmail = user.email?.trim() || "No account email available"
  const accountInitial = accountEmail.slice(0, 1).toUpperCase() || "?"

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

  const setTranslateFrom = (code: string) => {
    onPrefsChange({ ...prefs, translateFromLang: code })
  }

  const setTranslateTo = (code: string) => {
    onPrefsChange({ ...prefs, translateToLang: code })
  }

  const handleSyncNow = () => {
    setBusy(true)
    setSyncState("idle")
    setSyncMessage("")
    chrome.runtime
      .sendMessage({ type: "focusquote.sync.now" })
      .then((res) => {
        if (res && typeof res === "object" && (res as { ok?: boolean }).ok) {
          setSyncState("success")
          setSyncMessage("Sync complete. Local buffers flushed.")
          return refreshStats()
        }
        const err =
          res && typeof res === "object" && "error" in res
            ? String((res as { error?: unknown }).error ?? "Sync failed")
            : "Sync failed"
        setSyncState("error")
        setSyncMessage(err)
      })
      .catch((err) => {
        setSyncState("error")
        setSyncMessage(err instanceof Error ? err.message : "Sync failed")
      })
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
          <div class="flex min-w-0 items-center gap-2.5">
            {accountImageSrc ? (
              <img
                src={accountImageSrc}
                alt=""
                class="h-9 w-9 shrink-0 rounded-full border border-hairline object-cover"
              />
            ) : (
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-soft text-xs text-mute">
                {accountInitial}
              </div>
            )}
            <div class="min-w-0">
              <div class="truncate text-sm font-medium text-ink">{accountEmail}</div>
              {user.name && user.name !== accountEmail && (
                <div class="truncate text-xs text-mute">{user.name}</div>
              )}
            </div>
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
          <TimeControl
            label="Focus (min)"
            min={1}
            max={180}
            value={prefs.defaultDurationMinutes}
            onChange={setDuration}
          />
          <TimeControl
            label="Break (min)"
            min={0}
            max={60}
            value={prefs.defaultBreakMinutes}
            onChange={setBreak}
          />
        </div>
        <div class="mt-2 grid grid-cols-2 gap-2">
          <SelectField
            label="Translate from"
            value={prefs.translateFromLang}
            onChange={setTranslateFrom}
            includeAuto
          />
          <SelectField
            label="Translate to"
            value={prefs.translateToLang}
            onChange={setTranslateTo}
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
          {busy ? "Syncing…" : "Sync now"}
        </button>
        {syncState !== "idle" && (
          <p
            class={`mt-2 flex items-center gap-1 text-[11px] ${
              syncState === "success" ? "text-accent-green" : "text-accent-red"
            }`}
          >
            {syncState === "success" ? (
              <CheckCircle2 size={12} />
            ) : (
              <AlertCircle size={12} />
            )}
            {syncMessage}
          </p>
        )}
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

function TimeControl({
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
  const increase = () => onChange(Math.min(max, value + 1))
  const decrease = () => onChange(Math.max(min, value - 1))
  return (
    <div class="flex flex-col gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2.5 shadow-[0_1px_0_rgb(0_0_0_/_0.03)]">
      <span class="text-[10px] uppercase tracking-wider text-mute">
        {label}
      </span>
      <div class="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={decrease}
          class="flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-surface-soft text-body transition-colors hover:bg-hairline/40"
          aria-label={`Decrease ${label}`}
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onInput={(e) =>
            onChange(Number((e.currentTarget as HTMLInputElement).value))
          }
          class="w-16 rounded-md border border-hairline-soft bg-canvas px-2 py-1 text-center text-base tabular-nums text-ink outline-none focus:ring-1 focus:ring-focus-ring/70"
        />
        <button
          type="button"
          onClick={increase}
          class="flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-surface-soft text-body transition-colors hover:bg-hairline/40"
          aria-label={`Increase ${label}`}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  includeAuto = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  includeAuto?: boolean
}) {
  return (
    <label class="flex flex-col gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2.5">
      <span class="text-[10px] uppercase tracking-wider text-mute">
        {label}
      </span>
      <NativeSelect
        value={value}
        onInput={(e) => onChange((e.currentTarget as HTMLSelectElement).value)}
      >
        {includeAuto && <option value="auto">Auto detect</option>}
        {TRANSLATE_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </NativeSelect>
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
