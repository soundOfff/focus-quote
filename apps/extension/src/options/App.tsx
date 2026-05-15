import { useEffect, useRef, useState } from "preact/hooks"
import { Effect } from "effect"
import {
  Download,
  ImageUp,
  Key,
  LogOut,
  Minus,
  Moon,
  Plus,
  Sun,
  User as UserIcon,
} from "lucide-preact"
import { QuotesService } from "../services/quotes"
import { SessionsService } from "../services/sessions"
import { StorageService } from "../services/storage"
import { ApiService } from "../services/api"
import { AuthService } from "../services/auth"
import {
  clearOpenrouterKey as clearOpenrouterKeyRemote,
  ensureOpenrouterMigrated,
  getOpenrouterKeyState,
  saveOpenrouterKey as saveOpenrouterKeyRemote,
  type OpenrouterKeyState,
} from "../shared/settings"
import { applyTheme } from "../shared/theme"
import { useDebounce } from "../shared/use-debounce"
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
  defaultProfilePrefs,
  ensureProfileMigrated,
  loadProfilePrefs,
  pullProfileFromRemote,
  pushProfileToRemote,
  resolveAccountImageSrc,
  saveProfilePrefs,
  type ProfilePrefs,
} from "../shared/profile"
import { TRANSLATE_LANGUAGES } from "../shared/translation"
import type { Theme, User } from "@focus-quote/shared"
import { runP } from "./runtime"
import { PrivacySection } from "./components/PrivacySection"
import { Button, NativeSelect, SectionHeader, Surface } from "../ui/primitives"

const loadInitial = Effect.gen(function* () {
  const storage = yield* StorageService
  const auth = yield* AuthService
  const api = yield* ApiService

  // Best-effort one-time migrations: upload pre-existing local state on the
  // first authenticated load. Idempotent after success.
  yield* ensurePrefsMigrated(storage)
  yield* ensureProfileMigrated(storage)
  yield* ensureOpenrouterMigrated(storage)

  const prefs = yield* pullPrefsFromRemote(storage)
  let profile = yield* pullProfileFromRemote(storage)
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
  const openrouterKey = yield* getOpenrouterKeyState
  const user = yield* auth.currentUser

  // Check if server supports secrets storage (SECRETS_ENCRYPTION_KEY configured).
  // Best-effort: if the check fails, assume it's enabled (let error happen on save).
  const secretsSupported = yield* Effect.either(api.getSecret("openrouter")).pipe(
    Effect.map((r) => r._tag === "Right" || !String(r?.left?.message ?? "").includes("SECRETS_DISABLED")),
  )

  return { prefs, profile, openrouterKey, user, secretsSupported }
})

const signOut = Effect.gen(function* () {
  const auth = yield* AuthService
  yield* auth.signOut
})

const saveOpenrouterKey = (value: string) =>
  Effect.gen(function* () {
    if (value.trim()) {
      return yield* saveOpenrouterKeyRemote(value.trim())
    }
    yield* clearOpenrouterKeyRemote
    return { hasValue: false, hint: null, updatedAt: null } as OpenrouterKeyState
  })

const persistPrefs = (prefs: Prefs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* savePrefs(storage, prefs)
    yield* pushPrefsToRemote(prefs)
  })

const persistProfile = (profile: ProfilePrefs) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* saveProfilePrefs(storage, profile)
    yield* pushProfileToRemote(profile)
  })

const uploadProfilePhoto = (input: {
  mimeType: string
  dataBase64: string
  byteSize: number
}) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    const uploaded = yield* api.uploadMedia({
      kind: "profile_photo",
      mimeType: input.mimeType,
      dataBase64: input.dataBase64,
      byteSize: input.byteSize,
      sessionId: null,
    })
    return uploaded
  })

const exportAll = Effect.gen(function* () {
  const quotes = yield* QuotesService
  const sessions = yield* SessionsService
  const allQuotes = yield* quotes.list()
  const allSessions = yield* sessions.list()
  return {
    exportedAt: new Date().toISOString(),
    quotes: allQuotes,
    sessions: allSessions,
  }
})

export function App() {
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs)
  const [profile, setProfile] = useState<ProfilePrefs>(defaultProfilePrefs)
  const [openrouterKey, setOpenrouterKey] = useState("")
  const [openrouterState, setOpenrouterState] = useState<OpenrouterKeyState>({
    hasValue: false,
    hint: null,
    updatedAt: null,
  })
  const [keyStatus, setKeyStatus] = useState<"idle" | "saved" | "error">("idle")
  const [keyError, setKeyError] = useState<string | null>(null)
  const [profileStatus, setProfileStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [profileError, setProfileError] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [secretsSupported, setSecretsSupported] = useState(true)
  const accountImageSrc = resolveAccountImageSrc(profile.photoDataUrl, user?.image)
  const accountEmail = user?.email?.trim() || "No account email available"
  const accountInitial = accountEmail.slice(0, 1).toUpperCase() || "?"

  useEffect(() => {
    runP(loadInitial)
      .then((s) => {
        setPrefs(s.prefs)
        setProfile(s.profile)
        setOpenrouterState(s.openrouterKey)
        setOpenrouterKey(s.openrouterKey.hint ?? "")
        setUser(s.user)
        setSecretsSupported(s.secretsSupported)
        applyTheme(s.prefs.theme)
      })
      .catch(console.error)
  }, [])

  useEffect(
    () => () => {
      if (profileSaveTimer.current) window.clearTimeout(profileSaveTimer.current)
      if (keySaveTimer.current) window.clearTimeout(keySaveTimer.current)
    },
    [],
  )

  const profileSaveTimer = useRef<number | null>(null)
  const keySaveTimer = useRef<number | null>(null)

  const flushProfileSave = (next?: ProfilePrefs) => {
    const value = next ?? profile
    setProfileStatus("saving")
    setProfileError(null)
    runP(persistProfile(value))
      .then(() => {
        setProfileStatus("saved")
        setProfileError(null)
        setTimeout(() => setProfileStatus("idle"), 1200)
      })
      .catch((e) => {
        console.error("[FocusQuote] save profile:", e)
        setProfileStatus("error")
        setProfileError("Failed to save profile")
        setTimeout(() => {
          setProfileStatus("idle")
          setProfileError(null)
        }, 3000)
      })
  }

  const scheduleProfileSave = (next: ProfilePrefs) => {
    if (profileSaveTimer.current) window.clearTimeout(profileSaveTimer.current)
    profileSaveTimer.current = window.setTimeout(() => flushProfileSave(next), 250)
  }

  const flushKeySave = (nextValue?: string) => {
    const value = nextValue ?? openrouterKey
    // If the input shows the masked hint untouched, skip the save.
    if (openrouterState.hint && value === openrouterState.hint) return
    runP(saveOpenrouterKey(value))
      .then((state) => {
        setOpenrouterState(state)
        setOpenrouterKey(state.hint ?? "")
        setKeyStatus("saved")
        setKeyError(null)
        setTimeout(() => setKeyStatus("idle"), 1200)
      })
      .catch((e) => {
        const msg = String(e?.message ?? e)
        const isSecretsDisabled =
          msg.includes("SECRETS_DISABLED") || msg.includes("SECRETS_ENCRYPTION_KEY")
        setKeyError(
          isSecretsDisabled
            ? "Server not configured to store secrets. Admin: set SECRETS_ENCRYPTION_KEY env var."
            : "Failed to save API key",
        )
        setKeyStatus("error")
        setTimeout(() => setKeyStatus("idle"), 3000)
        console.error("[FocusQuote] save key:", e)
      })
  }

  const scheduleKeySave = (nextValue: string) => {
    if (keySaveTimer.current) window.clearTimeout(keySaveTimer.current)
    keySaveTimer.current = window.setTimeout(() => flushKeySave(nextValue), 250)
  }

  const debouncedPrefsPersist = useDebounce((next: Prefs) => {
    runP(persistPrefs(next)).catch(console.error)
  }, 250)

  const handleSignOut = () => {
    runP(signOut)
      .then(() => setUser(null))
      .catch(() => setUser(null))
  }

  const handleToggleTheme = () => {
    const nextTheme: Theme = prefs.theme === "dark" ? "light" : "dark"
    const next = { ...prefs, theme: nextTheme }
    setPrefs(next)
    applyTheme(nextTheme)
    runP(persistPrefs(next)).catch(console.error)
  }

  const setDuration = (n: number) => {
    const clamped = Math.max(1, Math.min(180, Math.floor(n) || prefs.defaultDurationMinutes))
    const next = { ...prefs, defaultDurationMinutes: clamped }
    setPrefs(next)
    debouncedPrefsPersist(next)
  }

  const setBreak = (n: number) => {
    const clamped = Math.max(0, Math.min(60, Math.floor(n) || prefs.defaultBreakMinutes))
    const next = { ...prefs, defaultBreakMinutes: clamped }
    setPrefs(next)
    debouncedPrefsPersist(next)
  }

  const setTranslateFrom = (code: string) => {
    const next = { ...prefs, translateFromLang: code }
    setPrefs(next)
    debouncedPrefsPersist(next)
  }

  const setTranslateTo = (code: string) => {
    const next = { ...prefs, translateToLang: code }
    setPrefs(next)
    debouncedPrefsPersist(next)
  }

  const handleProfileChange = (
    key: "displayName" | "headline",
    value: string,
  ) => {
    const next = { ...profile, [key]: value }
    setProfile(next)
    scheduleProfileSave(next)
  }

  const handleProfileImagePicked = async (file: File | null): Promise<void> => {
    if (!file) return
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return
    setPhotoBusy(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      const base64 = dataUrl.split(",")[1] ?? ""
      const uploaded = await runP(
        uploadProfilePhoto({
          mimeType: file.type,
          dataBase64: base64,
          byteSize: file.size,
        }),
      )
      const next = {
        ...profile,
        photoMediaFileId: uploaded.file.id,
        photoDataUrl: `data:${uploaded.file.mimeType};base64,${uploaded.file.dataBase64}`,
      }
      setProfile(next)
      flushProfileSave(next)
    } catch (e) {
      console.error("[FocusQuote] upload profile photo:", e)
    } finally {
      setPhotoBusy(false)
    }
  }

  const handleExport = () => {
    runP(exportAll)
      .then((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `focusquote-export-${new Date()
          .toISOString()
          .slice(0, 10)}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      })
      .catch((e) => console.error("[FocusQuote] export:", e))
  }

  return (
    <div class="min-h-screen bg-canvas text-body">
      <div class="mx-auto flex max-w-xl flex-col gap-6 px-6 py-12">
        <header class="flex items-center justify-between">
          <h1 class="text-2xl font-bold text-ink">FocusQuote</h1>
          <Button
            onClick={handleToggleTheme}
            aria-label="Toggle theme"
            variant="ghost"
            size="sm"
          >
            {prefs.theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
          </Button>
        </header>

        <Surface>
          <SectionHeader
            title="Account"
            icon={<UserIcon size={14} class="text-mute" />}
          />
          {user ? (
            <>
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold text-ink">
                    {accountEmail}
                  </div>
                  {user.name && user.name !== accountEmail && (
                    <div class="truncate text-xs text-mute">{user.name}</div>
                  )}
                </div>
                <Button
                  onClick={handleSignOut}
                  variant="outline"
                  size="sm"
                >
                  <LogOut size={12} />
                  Sign out
                </Button>
              </div>
              <div class="mt-4 grid gap-3 rounded-lg border border-hairline-soft bg-surface-doc p-3">
                <div class="flex items-center gap-3">
                  {accountImageSrc ? (
                    <img
                      src={accountImageSrc}
                      alt=""
                      class="h-10 w-10 rounded-full border border-hairline object-cover"
                    />
                  ) : (
                    <div class="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface-soft text-xs text-mute">
                      {accountInitial}
                    </div>
                  )}
                  <div class="text-xs text-mute">
                    Editable local profile shown in extension UI.
                  </div>
                </div>
                <InputField label="Email" value={accountEmail} readOnly />
                <InputField
                  label="Display name"
                  value={profile.displayName}
                  onInput={(value) => handleProfileChange("displayName", value)}
                  onBlur={() => flushProfileSave()}
                  onEnter={() => flushProfileSave()}
                />
                <ImageField
                  label="Profile image (stored in Turso bucket)"
                  busy={photoBusy}
                  onPick={handleProfileImagePicked}
                />
                <InputField
                  label="Headline"
                  value={profile.headline}
                  onInput={(value) => handleProfileChange("headline", value)}
                  onBlur={() => flushProfileSave()}
                  onEnter={() => flushProfileSave()}
                  placeholder="Student, writer, builder…"
                />
                <div class="flex items-center justify-between">
                  <p
                    class={`text-[11px] ${profileError ? "text-red-500" : "text-mute"}`}
                  >
                    {profileError
                      ? profileError
                      : profileStatus === "saving"
                        ? "Saving…"
                        : profileStatus === "saved"
                          ? "Saved"
                          : "Stored on this device + linked to your account"}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p class="text-xs text-mute">
              Open the FocusQuote popup from your toolbar to sign in.
            </p>
          )}
        </Surface>

        <Surface>
          <SectionHeader title="Session defaults" />
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
        </Surface>

        <Surface>
          <SectionHeader
            title="OpenRouter API key"
            icon={<Key size={14} class="text-mute" />}
          />
          <p class="mb-3 text-xs text-mute">
            Used for AI features (explain quote, smart search). Stored
            encrypted on the FocusQuote server and synced across your devices.
          </p>
          {!secretsSupported ? (
            <div class="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800 dark:border-yellow-900/30 dark:bg-yellow-900/20 dark:text-yellow-200">
              Server not configured for secret storage. Admin: set{" "}
              <code class="font-mono">SECRETS_ENCRYPTION_KEY</code> environment
              variable.
            </div>
          ) : (
            <div class="flex items-center gap-2">
              <input
                type="password"
                placeholder="sk-or-…"
                value={openrouterKey}
                onInput={(e) => {
                  const nextValue = (e.currentTarget as HTMLInputElement).value
                  setOpenrouterKey(nextValue)
                  scheduleKeySave(nextValue)
                }}
                onBlur={() => flushKeySave()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    flushKeySave()
                  }
                }}
                class="flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-sm outline-none ring-0 focus:ring-1 focus:ring-focus-ring"
              />
            </div>
          )}
          <p class={`mt-2 text-[11px] ${keyError ? "text-red-500" : "text-mute"}`}>
            {keyError
              ? keyError
              : keyStatus === "saved"
                ? "Saved"
                : secretsSupported
                  ? "Autosaves on blur/enter."
                  : ""}
          </p>
        </Surface>

        <PrivacySection />

        <Surface>
          <SectionHeader title="Data" />
          <p class="mb-3 text-xs text-mute">
            Download all locally cached quotes and sessions as JSON.
          </p>
          <Button onClick={handleExport} variant="outline">
            <Download size={14} /> Export JSON
          </Button>
        </Surface>
      </div>
    </div>
  )
}

function InputField({
  label,
  value,
  onInput,
  onBlur,
  onEnter,
  placeholder,
  readOnly = false,
}: {
  label: string
  value: string
  onInput?: (next: string) => void
  onBlur?: () => void
  onEnter?: () => void
  placeholder?: string
  readOnly?: boolean
}) {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-[10px] uppercase tracking-wider text-mute">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onInput={(e) => onInput?.((e.currentTarget as HTMLInputElement).value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (readOnly) return
          if (e.key === "Enter") {
            e.preventDefault()
            onEnter?.()
          }
        }}
        class={`rounded-md border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-focus-ring/70 ${
          readOnly ? "cursor-not-allowed opacity-80" : ""
        }`}
      />
    </label>
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
    <div class="flex flex-col gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2.5">
      <span class="text-[10px] uppercase tracking-wider text-mute">{label}</span>
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
      <span class="text-[10px] uppercase tracking-wider text-mute">{label}</span>
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

function ImageField({
  label,
  busy,
  onPick,
}: {
  label: string
  busy: boolean
  onPick: (file: File | null) => void | Promise<void>
}) {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-[10px] uppercase tracking-wider text-mute">{label}</span>
      <div class="flex cursor-pointer items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-body hover:bg-surface-soft">
        <ImageUp size={14} />
        <span>{busy ? "Uploading…" : "Choose image"}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          class="absolute h-0 w-0 overflow-hidden opacity-0"
          onInput={(e) => {
            const input = e.currentTarget as HTMLInputElement
            void onPick(input.files?.[0] ?? null)
            input.value = ""
          }}
        />
      </div>
    </label>
  )
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
