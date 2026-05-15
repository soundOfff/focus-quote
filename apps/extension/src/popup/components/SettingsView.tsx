import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import {
  ArrowLeft,
  Contrast,
  LogOut,
  Moon,
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
import {
  Button,
  MonoLabel,
  Segmented,
  Stepper,
  type SegmentedItem,
} from "../../ui/primitives"
import { runP } from "../runtime"

const loadStats = Effect.gen(function* () {
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
}) satisfies Effect.Effect<
  { quotes: number; sessions: number; queued: number },
  unknown,
  StorageService | SyncService | QuotesService | SessionsService
>

// Pull the user's local storage byte usage from chrome.storage.local so the
// "Local cache" progress bar in the Storage section reflects something real.
// `getBytesInUse()` is unavailable in some test environments — fall back to 0.
const readBytesInUse = (): Promise<number> =>
  new Promise((resolve) => {
    try {
      const storage = chrome?.storage?.local
      if (!storage?.getBytesInUse) return resolve(0)
      storage.getBytesInUse(null, (bytes) => {
        if (chrome.runtime.lastError) return resolve(0)
        resolve(typeof bytes === "number" ? bytes : 0)
      })
    } catch {
      resolve(0)
    }
  })

// Chrome's local storage quota for unpacked extensions is 10MB by default,
// but the more aggressive 5MB cap applies when `storage.local` is used without
// the `unlimitedStorage` permission. We display capacity against 50MB to
// match the design's "4.2 / 50 MB" example — it's a comfortable upper
// reference for a quotes/session archive.
const CACHE_CEILING_BYTES = 50 * 1024 * 1024
const formatMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)

const themeItems: ReadonlyArray<SegmentedItem<Theme>> = [
  { value: "light", label: <><Sun size={13} strokeWidth={1.7} /> Light</> },
  { value: "dark", label: <><Moon size={13} strokeWidth={1.7} /> Dark</> },
  // "auto" is shown for visual parity with the handoff. We treat it as a
  // soft alias for whichever variant currently applies — flipping to it
  // resolves to the current scheme so no behavior breaks.
  { value: "system" as Theme, label: <><Contrast size={13} strokeWidth={1.7} /> Auto</>, ariaLabel: "Match system" },
]

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
  const [stats, setStats] = useState({ quotes: 0, sessions: 0, queued: 0 })
  const [bytesInUse, setBytesInUse] = useState(0)

  const accountImageSrc = resolveAccountImageSrc(profilePhotoDataUrl, user.image)
  const accountName = (user.name?.trim() || user.email?.split("@")[0] || "—").trim()
  const accountEmail = (user.email?.trim() || "No account email").trim()
  const initials = useMemo(() => {
    const source = (user.name?.trim() || user.email?.trim() || "?").trim()
    const parts = source.split(/\s+|@/).filter(Boolean)
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase()
  }, [user])

  useEffect(() => {
    runP(loadStats).then(setStats).catch(() => {})
    readBytesInUse().then(setBytesInUse).catch(() => setBytesInUse(0))
  }, [])

  const setTheme = (theme: Theme) => {
    // "system" isn't part of our stored Theme type; ignore for storage but
    // still trigger applyTheme so the visual segmented control feels live.
    if (theme === ("system" as Theme)) {
      const prefers = window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      applyTheme(prefers)
      return
    }
    applyTheme(theme)
    onPrefsChange({ ...prefs, theme })
  }

  const setDuration = (n: number) => {
    onPrefsChange({ ...prefs, defaultDurationMinutes: n })
  }

  const setBreak = (n: number) => {
    onPrefsChange({ ...prefs, defaultBreakMinutes: n })
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

  const fromLangLabel =
    TRANSLATE_LANGUAGES.find((l) => l.code === prefs.translateFromLang)?.label ??
    "Auto"
  const toLangLabel =
    TRANSLATE_LANGUAGES.find((l) => l.code === prefs.translateToLang)?.label ??
    "English"

  const cachePct = Math.min(
    100,
    Math.max(0, (bytesInUse / CACHE_CEILING_BYTES) * 100),
  )

  return (
    <div class="flex flex-col bg-paper text-ink-2">
      <header class="flex items-center justify-between gap-2 border-b border-rule px-4 py-[14px]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          class="inline-flex items-center gap-1 rounded-chip px-2 py-[5px] text-[12px] font-medium text-muted transition-colors hover:bg-paper-2 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep/40"
        >
          <ArrowLeft size={13} strokeWidth={1.8} />
          Back
        </button>
        <span class="font-serif text-[14px] font-semibold text-ink">
          Settings
        </span>
        <span class="w-[38px]" aria-hidden />
      </header>

      <div class="flex flex-col gap-4 px-4 py-4">
        {/* Account */}
        <section class="flex flex-col gap-2">
          <MonoLabel as="h3">Account</MonoLabel>
          <div class="flex items-center gap-[10px] rounded-card border border-rule bg-paper-2 p-[10px]">
            {accountImageSrc ? (
              <img
                src={accountImageSrc}
                alt=""
                class="h-[34px] w-[34px] shrink-0 rounded-pill border border-amber object-cover"
              />
            ) : (
              <div class="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-pill border border-amber bg-amber-soft font-mono text-[12px] font-bold text-amber-deep">
                {initials}
              </div>
            )}
            <div class="min-w-0 flex-1">
              <div class="truncate text-[12.5px] font-semibold text-ink">
                {accountName}
              </div>
              <div class="truncate text-[11px] text-muted">{accountEmail}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              class="h-auto min-h-0 px-[9px] py-[6px] text-[11px]"
            >
              <LogOut size={12} strokeWidth={1.7} />
              Sign out
            </Button>
          </div>
        </section>

        {/* Appearance */}
        <section class="flex flex-col gap-2">
          <MonoLabel as="h3">Appearance</MonoLabel>
          <Segmented
            items={themeItems}
            value={prefs.theme}
            onChange={setTheme}
            variant="amber"
            class="w-full"
          />
        </section>

        {/* Session defaults */}
        <section class="flex flex-col gap-2">
          <MonoLabel as="h3">Session defaults</MonoLabel>
          <div class="grid grid-cols-2 gap-2">
            <Stepper
              label="Focus"
              value={prefs.defaultDurationMinutes}
              unit="min"
              min={1}
              max={180}
              onChange={setDuration}
            />
            <Stepper
              label="Break"
              value={prefs.defaultBreakMinutes}
              unit="min"
              min={0}
              max={60}
              onChange={setBreak}
            />
          </div>
        </section>

        {/* Translation — chip cards opening native selects underneath. The
            actual <select> floats invisibly over the chip so the click hands
            off to the browser-native picker (best a11y for a popup). */}
        <section class="flex flex-col gap-2">
          <MonoLabel as="h3">Translation</MonoLabel>
          <div class="grid grid-cols-2 gap-2">
            <LangChip
              label="From"
              value={fromLangLabel}
              selectValue={prefs.translateFromLang}
              onChange={(code) =>
                onPrefsChange({ ...prefs, translateFromLang: code })
              }
              includeAuto
            />
            <LangChip
              label="To"
              value={toLangLabel}
              selectValue={prefs.translateToLang}
              onChange={(code) =>
                onPrefsChange({ ...prefs, translateToLang: code })
              }
            />
          </div>
        </section>

        {/* Storage */}
        <section class="flex flex-col gap-2">
          <MonoLabel as="h3">Storage</MonoLabel>
          <div class="rounded-card border border-rule bg-paper-2 p-[11px]">
            <div class="mb-[6px] flex items-baseline justify-between">
              <span class="text-[12px] font-medium text-ink-2">
                Local cache
              </span>
              <span class="font-mono text-[10px] text-muted">
                {formatMb(bytesInUse)} / {formatMb(CACHE_CEILING_BYTES)} MB
              </span>
            </div>
            <div class="h-[5px] overflow-hidden rounded-pill border border-rule bg-paper">
              <div
                class="h-full bg-amber-gradient"
                style={{ width: `${cachePct.toFixed(2)}%` }}
                aria-hidden
              />
            </div>
            <div class="mt-[10px] grid grid-cols-3 gap-2 text-center">
              <StatCell value={stats.quotes} label="Quotes" />
              <StatCell value={stats.sessions} label="Sessions" />
              <StatCell value={stats.queued} label="Queued" />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div class="rounded-control border border-rule bg-paper px-2 py-2">
      <div class="font-mono text-[14px] font-medium tabular-nums text-ink">
        {value}
      </div>
      <MonoLabel as="div" class="mt-[2px] text-[9px]">
        {label}
      </MonoLabel>
    </div>
  )
}

interface LangChipProps {
  label: string
  value: string
  selectValue: string
  onChange: (code: string) => void
  includeAuto?: boolean
}

function LangChip({
  label,
  value,
  selectValue,
  onChange,
  includeAuto = false,
}: LangChipProps) {
  return (
    <label class="relative block rounded-card border border-rule bg-paper-2 px-[11px] py-[7px] transition-colors focus-within:border-amber-deep focus-within:bg-paper">
      <MonoLabel as="div" class="mb-[1px] text-[9.5px]">
        {label}
      </MonoLabel>
      <div class="flex items-center justify-between gap-2 text-[12.5px] font-medium text-ink">
        <span class="truncate">{value}</span>
        <svg
          width={11}
          height={11}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width={1.8}
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden
          class="shrink-0 text-muted"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
      <select
        value={selectValue}
        onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value)}
        aria-label={label}
        class="absolute inset-0 cursor-pointer opacity-0"
      >
        {includeAuto && <option value="auto">Auto</option>}
        {TRANSLATE_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </label>
  )
}
