import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import { Bug, Eye, EyeOff, Plus, Trash2 } from "lucide-preact"
import { StorageService } from "../../services/storage"
import {
  loadPrivacy,
  savePrivacy,
  defaultPrivacy,
  type Privacy,
} from "../../shared/privacy"
import { DEBUG_OVERLAY_KEY } from "../../shared/debug"
import { runP } from "../runtime"

const load = Effect.gen(function* () {
  const storage = yield* StorageService
  const privacy = yield* loadPrivacy(storage)
  const debugOverlay = yield* storage
    .get<boolean>(DEBUG_OVERLAY_KEY)
    .pipe(Effect.catchAll(() => Effect.succeed(false as boolean | null)))
  return { privacy, debugOverlay: debugOverlay === true }
})

const persist = (p: Privacy) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* savePrivacy(storage, p)
  })

const persistDebugOverlay = (enabled: boolean) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* storage.set(DEBUG_OVERLAY_KEY, enabled).pipe(
      Effect.catchAll(() => Effect.void),
    )
  })

export function PrivacySection() {
  const [privacy, setPrivacy] = useState<Privacy>(defaultPrivacy)
  const [newRule, setNewRule] = useState("")
  const [debugOverlay, setDebugOverlay] = useState(false)

  useEffect(() => {
    runP(load)
      .then(({ privacy: p, debugOverlay: d }) => {
        setPrivacy(p)
        setDebugOverlay(d)
      })
      .catch(console.error)
  }, [])

  const handleToggleDebug = () => {
    const next = !debugOverlay
    setDebugOverlay(next)
    runP(persistDebugOverlay(next)).catch(console.error)
  }

  const update = (next: Privacy) => {
    setPrivacy(next)
    runP(persist(next)).catch(console.error)
  }

  const handleToggle = () => update({ ...privacy, trackUrls: !privacy.trackUrls })

  const handleAdd = () => {
    const v = newRule.trim().toLowerCase().replace(/^https?:\/\//, "")
    if (!v) return
    if (privacy.blocklist.includes(v)) return
    update({ ...privacy, blocklist: [...privacy.blocklist, v] })
    setNewRule("")
  }

  const handleRemove = (rule: string) =>
    update({
      ...privacy,
      blocklist: privacy.blocklist.filter((r) => r !== rule),
    })

  return (
    <section class="rounded bg-card-light p-5 shadow-sm dark:bg-card-dark/60 dark:shadow-none">
      <h2 class="mb-1 flex items-center gap-2 text-sm font-medium">
        {privacy.trackUrls ? (
          <Eye size={14} class="text-accent" />
        ) : (
          <EyeOff size={14} class="text-accent" />
        )}{" "}
        URL tracking
      </h2>
      <p class="mb-3 text-xs opacity-60">
        When enabled, URLs visited during a focus session are sent to the server
        and classified by AI to surface distractions and recommendations.
        Hostnames in the blocklist below are never sent.
      </p>

      <div class="mb-4 flex items-center justify-between">
        <span class="text-sm">
          {privacy.trackUrls ? "Tracking enabled" : "Tracking disabled"}
        </span>
        <button
          type="button"
          onClick={handleToggle}
          aria-pressed={privacy.trackUrls}
          class={`relative h-6 w-11 rounded-full transition ${
            privacy.trackUrls ? "bg-accent" : "bg-bg-light dark:bg-bg-dark/60"
          }`}
        >
          <span
            class={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
              privacy.trackUrls ? "left-5" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div class="mb-2 text-xs font-medium opacity-80">Blocklist</div>
      <div class="mb-2 flex items-center gap-2">
        <input
          type="text"
          placeholder="example.com"
          value={newRule}
          onInput={(e) => setNewRule((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if ((e as KeyboardEvent).key === "Enter") handleAdd()
          }}
          class="flex-1 rounded bg-bg-light px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent dark:bg-bg-dark/60"
        />
        <button
          type="button"
          onClick={handleAdd}
          class="flex items-center gap-1 rounded border border-accent/40 px-3 py-2 text-xs text-accent transition hover:bg-accent/10"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      {privacy.blocklist.length === 0 ? (
        <p class="text-xs opacity-50">No domains blocked.</p>
      ) : (
        <ul class="space-y-1">
          {privacy.blocklist.map((rule) => (
            <li
              key={rule}
              class="flex items-center justify-between rounded bg-bg-light px-2 py-1 text-xs dark:bg-bg-dark/40"
            >
              <span class="font-mono">{rule}</span>
              <button
                type="button"
                onClick={() => handleRemove(rule)}
                aria-label={`Remove ${rule}`}
                class="opacity-50 transition hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div class="mt-5 border-t border-bg-dark/10 pt-4 dark:border-bg-light/5">
        <h3 class="mb-1 flex items-center gap-2 text-sm font-medium">
          <Bug size={14} class="text-accent" /> Debug overlay
        </h3>
        <p class="mb-3 text-xs opacity-60">
          Shows a floating panel on every page during a focus session with the
          tracker pipeline in real time (navigation, buffer adds, flush
          results, errors). Useful for debugging — leave off in normal use.
        </p>
        <div class="flex items-center justify-between">
          <span class="text-sm">
            {debugOverlay ? "Overlay enabled" : "Overlay disabled"}
          </span>
          <button
            type="button"
            onClick={handleToggleDebug}
            aria-pressed={debugOverlay}
            class={`relative h-6 w-11 rounded-full transition ${
              debugOverlay ? "bg-accent" : "bg-bg-light dark:bg-bg-dark/60"
            }`}
          >
            <span
              class={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                debugOverlay ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </section>
  )
}
