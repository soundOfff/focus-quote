import { useEffect, useRef, useState } from "preact/hooks"
import { Effect } from "effect"
import {
  Briefcase,
  Database,
  Download,
  ImageUp,
  Key,
  LogOut,
  Shield,
  Sparkles,
  Timer as TimerIcon,
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
import type { Theme, User, AiFeature } from "@focus-quote/shared"
import { aiFeatureDefault } from "@focus-quote/shared"
import { runP } from "./runtime"
import { PrivacySection } from "./components/PrivacySection"
import { JobApplicationSection } from "./components/JobApplicationSection"
import {
  Button,
  MonoLabel,
  SectionHeader,
  SkeletonCard,
  Stepper,
  Surface,
  TabPanel,
  Tabs,
  Toggle,
} from "../ui/primitives"
import { Dropdown, type DropdownOption } from "../ui/Dropdown"
import { AppShell } from "../ui/AppShell"
import { ToastProvider, useToast } from "../ui/Toast"
import type { RecallDepth, RecallQuestionCount } from "../shared/prefs"

// Token-spending features that get an individual toggle in the AI tab. autoTitle
// is omitted — it has its own dedicated section (issue #9).
const AI_FEATURE_CONTROLS: ReadonlyArray<{
  feature: AiFeature
  label: string
  description: string
}> = [
  {
    feature: "distractionDetection",
    label: "Distraction detection",
    description:
      "Scores the pages you visit during a session so FocusQuote can flag off-topic tabs.",
  },
  {
    feature: "sessionSummary",
    label: "Session summaries",
    description: "Generates a recap of what you read after a session ends.",
  },
  {
    feature: "studyTips",
    label: "Study tips",
    description: "Suggests follow-up actions based on a session's topic.",
  },
  {
    feature: "resourceRecommendations",
    label: "Resource recommendations",
    description: "Recommends further reading related to a session's topic.",
  },
  {
    feature: "quoteAssistant",
    label: "Quote + AI",
    description: "Explains or expands on a quote from the capture toolbar.",
  },
  {
    feature: "guideMe",
    label: "Guide Me",
    description: "Walks you through next steps from the capture toolbar.",
  },
  {
    feature: "jobAnswer",
    label: "Draft answer",
    description:
      "Drafts an answer to a selected question from your CV and Answer Bank during a Job application session.",
  },
]

const DIFFICULTY_OPTIONS: ReadonlyArray<DropdownOption<RecallDepth>> = [
  { value: "easy", label: "Easy" },
  { value: "standard", label: "Standard" },
  { value: "challenging", label: "Challenging" },
]

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

type OptionsTab = "account" | "session" | "ai" | "privacy" | "data" | "jobs"
const ACTIVE_TAB_KEY = "focusquote.options.activeTab"

const isOptionsTab = (v: unknown): v is OptionsTab =>
  v === "account" ||
  v === "session" ||
  v === "ai" ||
  v === "privacy" ||
  v === "data" ||
  v === "jobs"

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}

const shortHeaderDate = () =>
  new Date()
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase()

function AppInner() {
  const toast = useToast()
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
  const [loaded, setLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState<OptionsTab>("account")
  const accountImageSrc = resolveAccountImageSrc(profile.photoDataUrl, user?.image)
  const accountEmail = user?.email?.trim() || "No account email available"
  const accountInitial = accountEmail.slice(0, 1).toUpperCase() || "?"
  const recallEnabled =
    prefs.aiFeatureOverrides.recallQuestions ??
    aiFeatureDefault("recallQuestions")
  const recallGradingEnabled =
    prefs.aiFeatureOverrides.recallGrading ?? aiFeatureDefault("recallGrading")

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
      .finally(() => setLoaded(true))

    // Restore the active tab the user last had open.
    chrome.storage?.local
      ?.get(ACTIVE_TAB_KEY)
      .then((res) => {
        const stored = res?.[ACTIVE_TAB_KEY]
        if (isOptionsTab(stored)) setActiveTab(stored)
      })
      .catch(() => {})
  }, [])

  const handleTabChange = (next: OptionsTab) => {
    setActiveTab(next)
    chrome.storage?.local?.set({ [ACTIVE_TAB_KEY]: next }).catch(() => {})
  }

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

  const setAiMasterEnabled = (enabled: boolean) => {
    const next: Prefs = { ...prefs, aiMasterEnabled: enabled }
    setPrefs(next)
    debouncedPrefsPersist(next)
  }

  const setAutoTitleEnabled = (enabled: boolean) => {
    const next: Prefs = { ...prefs, autoTitleEnabled: enabled }
    setPrefs(next)
    debouncedPrefsPersist(next)
  }

  const setFeatureOverride = (feature: AiFeature, enabled: boolean) => {
    const next: Prefs = {
      ...prefs,
      aiFeatureOverrides: { ...prefs.aiFeatureOverrides, [feature]: enabled },
    }
    setPrefs(next)
    debouncedPrefsPersist(next)
  }

  const setRecallQuestionCount = (count: RecallQuestionCount) => {
    const next: Prefs = { ...prefs, recallQuestionCount: count }
    setPrefs(next)
    debouncedPrefsPersist(next)
  }

  const setRecallDepth = (depth: RecallDepth) => {
    const next: Prefs = { ...prefs, recallDepth: depth }
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
        toast.success("Export downloaded.")
      })
      .catch((e) => {
        console.error("[FocusQuote] export:", e)
        toast.error("Export failed.")
      })
  }

  return (
    <AppShell
      page="options"
      theme={prefs.theme}
      onToggleTheme={handleToggleTheme}
      headerDate={shortHeaderDate()}
    >
      <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 pb-8 pt-8 sm:px-6">
        <header class="mb-6 shrink-0 space-y-2">
          <MonoLabel tone="info">Settings</MonoLabel>
          <h1 class="text-balance font-serif text-[28px] font-semibold tracking-[-0.015em] text-ink">
            Options
          </h1>
          <p class="max-w-prose text-[13px] leading-[1.55] text-muted">
            Tune how FocusQuote behaves across your sessions, AI assistance and
            data handling.
          </p>
        </header>
        <Tabs<OptionsTab>
          value={activeTab}
          onChange={handleTabChange}
          class="self-start"
          items={[
            { value: "account", label: "Account", icon: <UserIcon size={12} /> },
            { value: "session", label: "Session", icon: <TimerIcon size={12} /> },
            { value: "ai", label: "AI", icon: <Sparkles size={12} /> },
            { value: "privacy", label: "Privacy", icon: <Shield size={12} /> },
            { value: "data", label: "Data", icon: <Database size={12} /> },
            { value: "jobs", label: "Jobs", icon: <Briefcase size={12} /> },
          ]}
        />

        <div class="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto pb-8 pr-1">
          {!loaded ? (
            <div class="flex flex-col gap-4">
              <SkeletonCard lines={3} />
              <SkeletonCard lines={3} />
            </div>
          ) : (
            <>
              <TabPanel active={activeTab === "account"}>
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
                            <div class="truncate text-xs text-mute">
                              {user.name}
                            </div>
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
                      <div class="mt-4 grid gap-3">
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
                          onInput={(value) =>
                            handleProfileChange("displayName", value)
                          }
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
                          onInput={(value) =>
                            handleProfileChange("headline", value)
                          }
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
              </TabPanel>

              <TabPanel active={activeTab === "session"}>
                <Surface>
                  <SectionHeader
                    title="Session default"
                    icon={<TimerIcon size={14} class="text-primary" />}
                  />
                  <div class="grid grid-cols-2 gap-2">
                    <Stepper
                      label="Focus"
                      unit="min"
                      min={1}
                      max={180}
                      value={prefs.defaultDurationMinutes}
                      onChange={setDuration}
                    />
                    <Stepper
                      label="Break"
                      unit="min"
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
              </TabPanel>

              <TabPanel active={activeTab === "ai"}>
                <Surface>
                  <SectionHeader
                    title="AI assistance"
                    subtitle="Master switch for every AI feature. When off, nothing spends tokens — distraction detection, summaries, Quote + AI and Guide Me all pause."
                    action={
                      <Toggle
                        enabled={prefs.aiMasterEnabled}
                        onToggle={() =>
                          setAiMasterEnabled(!prefs.aiMasterEnabled)
                        }
                        ariaLabel="Toggle AI assistance"
                      />
                    }
                  />
                </Surface>

                <Surface>
                  <SectionHeader
                    title="Per-feature controls"
                    subtitle="Turn individual AI features on or off. Each only spends tokens when enabled and the master switch above is on."
                  />
                  <div class="flex flex-col gap-3">
                    {AI_FEATURE_CONTROLS.map((control) => {
                      const enabled =
                        prefs.aiFeatureOverrides[control.feature] ??
                        aiFeatureDefault(control.feature)
                      return (
                        <div
                          key={control.feature}
                          class="flex items-start justify-between gap-3"
                        >
                          <div class="min-w-0">
                            <p class="text-[13px] text-ink-2">{control.label}</p>
                            <p class="text-[11px] text-muted">
                              {control.description}
                            </p>
                          </div>
                          <Toggle
                            enabled={enabled}
                            onToggle={() =>
                              setFeatureOverride(control.feature, !enabled)
                            }
                            ariaLabel={`Toggle ${control.label}`}
                          />
                        </div>
                      )
                    })}
                  </div>
                  {!prefs.aiMasterEnabled && (
                    <p class="mt-2 text-[11px] text-muted">
                      Turn on AI assistance above for these to take effect.
                    </p>
                  )}
                </Surface>

                <Surface>
                  <SectionHeader
                    title="Auto-title sessions"
                    subtitle="When you start a session without a goal, FocusQuote can name it for you from its topic and the pages you visited. Off by default — it spends a few tokens per session."
                    action={
                      <Toggle
                        enabled={prefs.autoTitleEnabled}
                        onToggle={() =>
                          setAutoTitleEnabled(!prefs.autoTitleEnabled)
                        }
                        ariaLabel="Toggle auto-title"
                      />
                    }
                  />
                  {!prefs.aiMasterEnabled && (
                    <p class="mt-2 text-[11px] text-muted">
                      Turn on AI assistance above for this to take effect.
                    </p>
                  )}
                </Surface>

                <Surface>
                  <SectionHeader
                    title="Recall questions"
                    subtitle="After a session, generate quiz questions from the material you captured — and optionally grade your answers."
                  />
                  <div class="mb-3 flex flex-col gap-3">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-[13px] text-ink-2">Recall questions</p>
                        <p class="text-[11px] text-muted">
                          Writes quiz questions from the material you captured.
                        </p>
                      </div>
                      <Toggle
                        enabled={recallEnabled}
                        onToggle={() =>
                          setFeatureOverride("recallQuestions", !recallEnabled)
                        }
                        ariaLabel="Toggle recall questions"
                      />
                    </div>
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-[13px] text-ink-2">Recall grading</p>
                        <p class="text-[11px] text-muted">
                          Grades your answers to recall questions.
                        </p>
                      </div>
                      <Toggle
                        enabled={recallGradingEnabled}
                        onToggle={() =>
                          setFeatureOverride("recallGrading", !recallGradingEnabled)
                        }
                        ariaLabel="Toggle recall grading"
                      />
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <NumberField
                      label="Question count (max 15)"
                      value={prefs.recallQuestionCount}
                      min={1}
                      max={15}
                      onCommit={setRecallQuestionCount}
                    />
                    <div class="flex flex-col gap-1.5 rounded-card border border-rule bg-paper-2 px-[11px] py-[7px]">
                      <MonoLabel as="span" class="text-[9.5px]">
                        Difficulty
                      </MonoLabel>
                      <Dropdown<RecallDepth>
                        value={prefs.recallDepth}
                        onChange={setRecallDepth}
                        ariaLabel="Difficulty"
                        triggerClass="h-9 rounded-control border border-rule-2 bg-paper px-[11px] text-[12.5px] text-ink aria-expanded:border-amber-deep"
                        options={DIFFICULTY_OPTIONS}
                      />
                    </div>
                  </div>
                </Surface>

                <Surface>
                  <SectionHeader
                    title="OpenRouter API key"
                    icon={<Key size={14} class="text-mute" />}
                  />
                  <p class="mb-3 text-xs text-mute">
                    Used for AI features (explain quote, smart search). Stored
                    encrypted on the FocusQuote server and synced across your
                    devices.
                  </p>
                  {!secretsSupported ? (
                    <div class="rounded-card border border-clay-soft bg-clay-soft/60 p-3 text-[11.5px] leading-relaxed text-clay-ink">
                      Server not configured for secret storage. Admin: set{" "}
                      <code class="font-mono">SECRETS_ENCRYPTION_KEY</code>{" "}
                      environment variable.
                    </div>
                  ) : (
                    <div class="flex items-center gap-2">
                      <input
                        type="password"
                        placeholder="sk-or-…"
                        value={openrouterKey}
                        onInput={(e) => {
                          const nextValue = (e.currentTarget as HTMLInputElement)
                            .value
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
                        class="flex-1 rounded-control border border-rule-2 bg-paper-2 px-3 py-2 font-mono text-[12.5px] text-ink placeholder:text-muted-2 outline-none focus:border-amber-deep focus:bg-paper focus:ring-[3px] focus:ring-amber/15"
                      />
                    </div>
                  )}
                  <p
                    class={`mt-2 text-[11px] ${
                      keyError ? "text-clay-ink" : "text-muted"
                    }`}
                  >
                    {keyError
                      ? keyError
                      : keyStatus === "saved"
                        ? "Saved"
                        : secretsSupported
                          ? "Autosaves on blur/enter."
                          : ""}
                  </p>
                </Surface>

              </TabPanel>

              <TabPanel active={activeTab === "privacy"}>
                <PrivacySection />
              </TabPanel>

              <TabPanel active={activeTab === "data"}>
                <Surface>
                  <SectionHeader title="Data" />
                  <p class="mb-3 text-xs text-mute">
                    Download all locally cached quotes and sessions as JSON.
                  </p>
                  <Button onClick={handleExport} variant="outline">
                    <Download size={14} /> Export JSON
                  </Button>
                </Surface>
              </TabPanel>

              <TabPanel active={activeTab === "jobs"}>
                <JobApplicationSection />
              </TabPanel>
            </>
          )}
        </div>
      </div>
    </AppShell>
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
    <label class="flex flex-col gap-1.5">
      <MonoLabel as="span" class="text-[9.5px]">
        {label}
      </MonoLabel>
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
        class={`rounded-control border border-rule-2 bg-paper-2 px-3 py-2 text-[13px] text-ink placeholder:text-muted-2 outline-none focus:border-amber-deep focus:bg-paper focus:ring-[3px] focus:ring-amber/15 ${
          readOnly ? "cursor-not-allowed opacity-80" : ""
        }`}
      />
    </label>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (next: number) => void
}) {
  // Local text buffer so the user can freely clear/retype; we validate and
  // clamp to [min, max] on blur or Enter, then snap the display to the
  // committed value.
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText(String(value))
  }, [value])

  const commit = () => {
    const n = Number(text)
    if (text.trim() === "" || !Number.isFinite(n)) {
      setText(String(value))
      return
    }
    const clamped = Math.max(min, Math.min(max, Math.floor(n)))
    setText(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <label class="flex flex-col gap-1.5 rounded-card border border-rule bg-paper-2 px-[11px] py-[7px]">
      <MonoLabel as="span" class="text-[9.5px]">
        {label}
      </MonoLabel>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={text}
        onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          }
        }}
        class="!h-9 rounded-control border border-rule-2 bg-paper px-[11px] text-[12.5px] text-ink outline-none focus:border-amber-deep focus:ring-[3px] focus:ring-amber/15"
      />
    </label>
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
  const options: ReadonlyArray<DropdownOption<string>> = [
    ...(includeAuto ? [{ value: "auto", label: "Auto detect" }] : []),
    ...TRANSLATE_LANGUAGES.map((lang) => ({ value: lang.code, label: lang.label })),
  ]
  return (
    <div class="flex flex-col gap-1.5 rounded-card border border-rule bg-paper-2 px-[11px] py-[7px]">
      <MonoLabel as="span" class="text-[9.5px]">
        {label}
      </MonoLabel>
      <Dropdown
        value={value}
        onChange={onChange}
        ariaLabel={label}
        options={options}
        triggerClass="h-9 rounded-control border border-rule-2 bg-paper px-[11px] text-[12.5px] text-ink aria-expanded:border-amber-deep"
      />
    </div>
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
    <label class="relative flex flex-col gap-1.5">
      <MonoLabel as="span" class="text-[9.5px]">
        {label}
      </MonoLabel>
      <div class="flex cursor-pointer items-center gap-2 rounded-control border border-rule-2 bg-paper-2 px-3 py-2 text-[12.5px] text-ink-2 transition-colors hover:bg-paper">
        <ImageUp size={13} strokeWidth={1.7} />
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
