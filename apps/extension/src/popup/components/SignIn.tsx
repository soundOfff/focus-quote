import { useState } from "preact/hooks"
import { Effect } from "effect"
import { ArrowLeft, LogIn, Mail } from "lucide-preact"
import { AuthService } from "../../services/auth"
import { runP } from "../runtime"
import { Button, MonoLabel } from "../../ui/primitives"

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
      <div class="flex flex-col gap-3 px-5 py-8 text-center">
        <Mail size={28} strokeWidth={1.6} class="mx-auto text-amber-deep" />
        <h2 class="font-serif text-base font-semibold text-ink">
          Check your inbox
        </h2>
        <p class="text-[12.5px] leading-relaxed text-muted">
          We sent a sign-in link to <strong class="text-ink-2">{email}</strong>.
          Click it in this browser to continue.
        </p>
        <button
          type="button"
          onClick={() => {
            setMagicSent(false)
            setMode("choose")
            setEmail("")
          }}
          class="mt-2 text-[11px] font-medium text-muted underline-offset-2 hover:text-ink-2 hover:underline"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-4 px-5 py-6">
      <header class="space-y-2">
        <MonoLabel tone="info">Welcome</MonoLabel>
        <h1 class="font-serif text-[20px] font-semibold tracking-[-0.01em] text-ink">
          Sign in to Focus
          <span class="text-amber-deep">Quote</span>
        </h1>
        <p class="text-[12.5px] leading-relaxed text-muted">
          Quotes and sessions sync across your devices once you're signed in.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          class="rounded-card border border-clay-soft bg-clay-soft/60 px-3 py-2 text-[11.5px] leading-relaxed text-clay-ink"
        >
          {error}
        </div>
      )}

      {mode === "choose" ? (
        <div class="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={handleGoogle}
            disabled={busy}
            class="w-full"
          >
            <LogIn size={13} strokeWidth={1.8} />
            Continue with Google
          </Button>
          <div class="my-1 flex items-center gap-2">
            <span class="h-px flex-1 bg-rule" aria-hidden />
            <MonoLabel class="text-[9.5px]">or</MonoLabel>
            <span class="h-px flex-1 bg-rule" aria-hidden />
          </div>
          <Button
            variant="ghost"
            onClick={() => setMode("magic")}
            disabled={busy}
            class="w-full"
          >
            <Mail size={13} strokeWidth={1.8} />
            Email me a magic link
          </Button>
        </div>
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
            class="rounded-control border border-rule-2 bg-paper-2 px-3 py-[9px] text-[13px] text-ink placeholder:text-muted-2 focus:border-amber-deep focus:outline-none focus:ring-[3px] focus:ring-amber/15"
          />
          <Button
            variant="primary"
            type="submit"
            disabled={busy || !email.trim()}
            class="w-full"
          >
            {busy ? "Sending…" : "Send magic link"}
          </Button>
          <button
            type="button"
            onClick={() => setMode("choose")}
            class="mt-1 flex items-center justify-center gap-1 text-[11px] font-medium text-muted hover:text-ink-2"
          >
            <ArrowLeft size={11} strokeWidth={1.8} /> Back
          </button>
        </form>
      )}
    </div>
  )
}
