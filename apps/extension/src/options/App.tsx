import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import { Download, Key, LogOut, Moon, Sun, User as UserIcon } from "lucide-preact"
import { QuotesService } from "../services/quotes"
import { SessionsService } from "../services/sessions"
import { StorageService } from "../services/storage"
import { AuthService } from "../services/auth"
import { OPENROUTER_KEY_KEY } from "../shared/settings"
import { applyTheme, loadTheme, saveTheme } from "../shared/theme"
import type { Theme, User } from "@focus-quote/shared"
import { runP } from "./runtime"
import { PrivacySection } from "./components/PrivacySection"
import { Button, SectionHeader, Surface } from "../ui/primitives"

const loadInitial = Effect.gen(function* () {
  const storage = yield* StorageService
  const auth = yield* AuthService
  const theme = yield* loadTheme(storage)
  const key = yield* storage.get<string>(OPENROUTER_KEY_KEY)
  const user = yield* auth.currentUser
  return { theme, openrouterKey: key ?? "", user }
})

const signOut = Effect.gen(function* () {
  const auth = yield* AuthService
  yield* auth.signOut
})

const saveOpenrouterKey = (value: string) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    if (value.trim()) {
      yield* storage.set(OPENROUTER_KEY_KEY, value.trim())
    } else {
      yield* storage.remove(OPENROUTER_KEY_KEY)
    }
  })

const persistTheme = (theme: Theme) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* saveTheme(storage, theme)
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
  const [theme, setTheme] = useState<Theme>("dark")
  const [openrouterKey, setOpenrouterKey] = useState("")
  const [keyStatus, setKeyStatus] = useState<"idle" | "saved">("idle")
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    runP(loadInitial)
      .then((s) => {
        setTheme(s.theme)
        setOpenrouterKey(s.openrouterKey)
        setUser(s.user)
        applyTheme(s.theme)
      })
      .catch(console.error)
  }, [])

  const handleSignOut = () => {
    runP(signOut)
      .then(() => setUser(null))
      .catch(() => setUser(null))
  }

  const handleToggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setTheme(next)
    applyTheme(next)
    runP(persistTheme(next)).catch(console.error)
  }

  const handleSaveKey = () => {
    runP(saveOpenrouterKey(openrouterKey))
      .then(() => {
        setKeyStatus("saved")
        setTimeout(() => setKeyStatus("idle"), 1500)
      })
      .catch((e) => console.error("[FocusQuote] save key:", e))
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
            {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
          </Button>
        </header>

        <Surface>
          <SectionHeader
            title="Account"
            icon={<UserIcon size={14} class="text-mute" />}
          />
          {user ? (
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-ink">
                  {user.name ?? user.email}
                </div>
                {user.name && (
                  <div class="truncate text-xs text-mute">{user.email}</div>
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
          ) : (
            <p class="text-xs text-mute">
              Open the FocusQuote popup from your toolbar to sign in.
            </p>
          )}
        </Surface>

        <Surface>
          <SectionHeader
            title="OpenRouter API key"
            icon={<Key size={14} class="text-mute" />}
          />
          <p class="mb-3 text-xs text-mute">
            Used for upcoming AI features (explain quote, smart search). Stored
            locally in this browser only.
          </p>
          <div class="flex items-center gap-2">
            <input
              type="password"
              placeholder="sk-or-…"
              value={openrouterKey}
              onInput={(e) =>
                setOpenrouterKey((e.currentTarget as HTMLInputElement).value)
              }
              class="flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-sm outline-none ring-0 focus:ring-1 focus:ring-focus-ring"
            />
            <Button onClick={handleSaveKey} variant="primary">
              {keyStatus === "saved" ? "Saved" : "Save"}
            </Button>
          </div>
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
