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
import { Button, SectionHeader, Surface, Toggle } from "../../ui/primitives"

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
    <Surface>
      <SectionHeader
        title="URL tracking"
        icon={
          privacy.trackUrls ? (
            <Eye size={14} class="text-mute" />
          ) : (
            <EyeOff size={14} class="text-mute" />
          )
        }
      />
      <p class="mb-3 text-xs text-mute">
        When enabled, URLs visited during a focus session are sent to the server
        and classified by AI to surface distractions and recommendations.
        Hostnames in the blocklist below are never sent.
      </p>

      <div class="mb-4 flex items-center justify-between">
        <span class="text-sm text-ink">
          {privacy.trackUrls ? "Tracking enabled" : "Tracking disabled"}
        </span>
        <Toggle
          enabled={privacy.trackUrls}
          onToggle={handleToggle}
          ariaLabel="Toggle URL tracking"
        />
      </div>

      <div class="mb-2 text-xs font-medium text-body">Blocklist</div>
      <div class="mb-2 flex items-center gap-2">
        <input
          type="text"
          placeholder="example.com"
          value={newRule}
          onInput={(e) => setNewRule((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if ((e as KeyboardEvent).key === "Enter") handleAdd()
          }}
          class="flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-focus-ring"
        />
        <Button onClick={handleAdd} variant="outline" size="sm">
          <Plus size={12} /> Add
        </Button>
      </div>
      {privacy.blocklist.length === 0 ? (
        <p class="text-xs text-mute">No domains blocked.</p>
      ) : (
        <ul class="space-y-1">
          {privacy.blocklist.map((rule) => (
            <li
              key={rule}
              class="flex items-center justify-between rounded-md border border-hairline-soft bg-surface-doc px-2 py-1 text-xs"
            >
              <span class="font-mono">{rule}</span>
              <button
                type="button"
                onClick={() => handleRemove(rule)}
                aria-label={`Remove ${rule}`}
                class="text-mute transition-opacity hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div class="mt-5 border-t border-hairline-soft pt-4">
        <h3 class="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
          <Bug size={14} class="text-mute" /> Debug overlay
        </h3>
        <p class="mb-3 text-xs text-mute">
          Shows a floating panel on every page during a focus session with the
          tracker pipeline in real time (navigation, buffer adds, flush
          results, errors). Useful for debugging — leave off in normal use.
        </p>
        <div class="flex items-center justify-between">
          <span class="text-sm text-ink">
            {debugOverlay ? "Overlay enabled" : "Overlay disabled"}
          </span>
          <Toggle
            enabled={debugOverlay}
            onToggle={handleToggleDebug}
            ariaLabel="Toggle debug overlay"
          />
        </div>
      </div>
    </Surface>
  )
}
