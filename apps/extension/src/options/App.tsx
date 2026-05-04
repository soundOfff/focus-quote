import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import { CheckCircle2, Download, Key, Moon, Sun, XCircle } from "lucide-preact"
import { DatabaseService } from "../services/database"
import { QuotesService } from "../services/quotes"
import { SessionsService } from "../services/sessions"
import { StorageService } from "../services/storage"
import { OPENROUTER_KEY_KEY } from "../shared/settings"
import {
  applyTheme,
  loadTheme,
  saveTheme,
} from "../shared/theme"
import { tursoConfigStatus } from "../shared/config"
import type { Theme } from "@focus-quote/shared"
import { runP } from "./runtime"

type ConnState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "error"; message: string }

const loadInitial = Effect.gen(function* () {
  const storage = yield* StorageService
  const theme = yield* loadTheme(storage)
  const key = yield* storage.get<string>(OPENROUTER_KEY_KEY)
  return { theme, openrouterKey: key ?? "" }
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

const testConnection = Effect.gen(function* () {
  const db = yield* DatabaseService
  if (!db.isReady()) {
    return { ok: false as const, message: "Turso not configured at build time" }
  }
  return yield* db.ping.pipe(
    Effect.map(() => ({ ok: true as const })),
    Effect.catchAll((err) =>
      Effect.succeed({ ok: false as const, message: err.message }),
    ),
  )
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
  const [conn, setConn] = useState<ConnState>({ kind: "idle" })

  useEffect(() => {
    runP(loadInitial)
      .then((s) => {
        setTheme(s.theme)
        setOpenrouterKey(s.openrouterKey)
        applyTheme(s.theme)
      })
      .catch(console.error)
  }, [])

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

  const handleTestConnection = () => {
    setConn({ kind: "checking" })
    runP(testConnection)
      .then((r) =>
        r.ok ? setConn({ kind: "ok" }) : setConn({ kind: "error", message: r.message }),
      )
      .catch((e) => setConn({ kind: "error", message: String(e) }))
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
    <div class="min-h-screen bg-bg-light text-text-light transition dark:bg-bg-dark dark:text-text-dark">
      <div class="mx-auto flex max-w-xl flex-col gap-6 px-6 py-12">
        <header class="flex items-center justify-between">
          <h1 class="text-2xl font-semibold text-accent">FocusQuote</h1>
          <button
            type="button"
            onClick={handleToggleTheme}
            aria-label="Toggle theme"
            class="rounded p-2 opacity-60 transition hover:bg-card-light hover:opacity-100 dark:hover:bg-card-dark/40"
          >
            {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </header>

        <section class="rounded bg-card-light p-5 shadow-sm dark:bg-card-dark/60 dark:shadow-none">
          <h2 class="mb-1 flex items-center gap-2 text-sm font-medium">
            <Key size={14} class="text-accent" /> OpenRouter API key
          </h2>
          <p class="mb-3 text-xs opacity-60">
            Used for upcoming AI features (explain quote, smart search). Stored
            locally in this browser only.
          </p>
          <div class="flex items-center gap-2">
            <input
              type="password"
              placeholder="sk-or-…"
              value={openrouterKey}
              onInput={(e) =>
                setOpenrouterKey(
                  (e.currentTarget as HTMLInputElement).value,
                )
              }
              class="flex-1 rounded bg-bg-light px-3 py-2 text-sm outline-none ring-0 focus:ring-1 focus:ring-accent dark:bg-bg-dark/60"
            />
            <button
              type="button"
              onClick={handleSaveKey}
              class="rounded bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90"
            >
              {keyStatus === "saved" ? "Saved" : "Save"}
            </button>
          </div>
        </section>

        <section class="rounded bg-card-light p-5 shadow-sm dark:bg-card-dark/60 dark:shadow-none">
          <h2 class="mb-1 text-sm font-medium">Turso connection</h2>
          <p class="mb-3 text-xs opacity-60">
            {(() => {
              const s = tursoConfigStatus()
              if (s.ok) return "URL and token were baked at build time."
              return s.reason ?? "Not configured at build time. Set TURSO_DB_URL and TURSO_AUTH_TOKEN in .env and rebuild."
            })()}
          </p>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={conn.kind === "checking"}
              class="rounded border border-accent/40 px-3 py-2 text-sm text-accent transition hover:bg-accent/10 disabled:opacity-40"
            >
              Test connection
            </button>
            {conn.kind === "ok" && (
              <span class="flex items-center gap-1 text-sm text-green-500">
                <CheckCircle2 size={14} /> OK
              </span>
            )}
            {conn.kind === "error" && (
              <span class="flex items-center gap-1 text-sm text-red-400">
                <XCircle size={14} /> {conn.message}
              </span>
            )}
            {conn.kind === "checking" && (
              <span class="text-sm opacity-60">Checking…</span>
            )}
          </div>
        </section>

        <section class="rounded bg-card-light p-5 shadow-sm dark:bg-card-dark/60 dark:shadow-none">
          <h2 class="mb-1 text-sm font-medium">Data</h2>
          <p class="mb-3 text-xs opacity-60">
            Download all locally cached quotes and sessions as JSON.
          </p>
          <button
            type="button"
            onClick={handleExport}
            class="flex items-center gap-2 rounded border border-accent/40 px-3 py-2 text-sm text-accent transition hover:bg-accent/10"
          >
            <Download size={14} /> Export JSON
          </button>
        </section>
      </div>
    </div>
  )
}
