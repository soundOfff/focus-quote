import { useState } from "preact/hooks"
import { Effect } from "effect"
import { ArrowLeft, LogIn, Mail } from "lucide-preact"
import { AuthService } from "../../services/auth"
import { runP } from "../runtime"

interface Props {
  onSignedIn: () => void
}

export function SignIn({ onSignedIn }: Props) {
  const [mode, setMode] = useState<"choose" | "magic">("choose")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogle = () => {
    setBusy(true)
    setError(null)
    runP(
      Effect.gen(function* () {
        const auth = yield* AuthService
        return yield* auth.signInGoogle
      }),
    )
      .then(() => onSignedIn())
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setBusy(false))
  }

  const handleMagic = (e: Event) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    runP(
      Effect.gen(function* () {
        const auth = yield* AuthService
        yield* auth.signInMagicLink(email.trim())
      }),
    )
      .then(() => setMagicSent(true))
      .catch((err) => setError(err?.message ?? String(err)))
      .finally(() => setBusy(false))
  }

  if (magicSent) {
    return (
      <div class="flex flex-col gap-3 p-6 text-center">
        <Mail size={28} class="mx-auto text-accent" />
        <h2 class="text-base font-medium">Check your inbox</h2>
        <p class="text-sm opacity-60">
          We sent a sign-in link to <strong>{email}</strong>. Click it in this
          browser to continue.
        </p>
        <button
          type="button"
          onClick={() => {
            setMagicSent(false)
            setMode("choose")
            setEmail("")
          }}
          class="mt-2 text-xs underline opacity-60 hover:opacity-100"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-4 p-6">
      <header>
        <h1 class="text-lg font-semibold text-accent">Sign in to FocusQuote</h1>
        <p class="mt-1 text-xs opacity-60">
          Quotes and sessions sync across your devices once you're signed in.
        </p>
      </header>

      {error && (
        <div class="rounded bg-accent/10 px-3 py-2 text-xs text-accent">
          {error}
        </div>
      )}

      {mode === "choose" ? (
        <>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            class="flex items-center justify-center gap-2 rounded bg-accent py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-40"
          >
            <LogIn size={14} />
            Continue with Google
          </button>
          <div class="my-1 flex items-center gap-2 text-xs opacity-40">
            <span class="h-px flex-1 bg-current" />
            <span>or</span>
            <span class="h-px flex-1 bg-current" />
          </div>
          <button
            type="button"
            onClick={() => setMode("magic")}
            disabled={busy}
            class="flex items-center justify-center gap-2 rounded border border-accent/40 py-2 text-sm text-accent transition hover:bg-accent/10 disabled:opacity-40"
          >
            <Mail size={14} />
            Email me a magic link
          </button>
        </>
      ) : (
        <form onSubmit={handleMagic} class="flex flex-col gap-2">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onInput={(e) =>
              setEmail((e.currentTarget as HTMLInputElement).value)
            }
            required
            autoFocus
            class="rounded bg-card-light px-3 py-2 text-sm shadow-sm placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-accent dark:bg-card-dark dark:shadow-none"
          />
          <button
            type="submit"
            disabled={busy || !email.trim()}
            class="rounded bg-accent py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send magic link"}
          </button>
          <button
            type="button"
            onClick={() => setMode("choose")}
            class="flex items-center justify-center gap-1 text-xs opacity-60 hover:opacity-100"
          >
            <ArrowLeft size={11} /> Back
          </button>
        </form>
      )}
    </div>
  )
}
