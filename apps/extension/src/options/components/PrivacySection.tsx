import { useEffect, useState } from "preact/hooks"
import { Effect } from "effect"
import { Bug, Eye, EyeOff, Plus, Trash2 } from "lucide-preact"
import { StorageService } from "../../services/storage"
import {
  ensurePrivacyMigrated,
  loadPrivacy,
  pullPrivacyFromRemote,
  pushPrivacyToRemote,
  savePrivacy,
  defaultPrivacy,
  type Privacy,
} from "../../shared/privacy"
import { DEBUG_OVERLAY_KEY } from "../../shared/debug"
import { loadPrefs, pushPrefsToRemote } from "../../shared/prefs"
import { runP } from "../runtime"
import {
  Button,
  MonoLabel,
  SectionHeader,
  Skeleton,
  Surface,
  Toggle,
} from "../../ui/primitives"
import { validateDomainEntry } from "../../shared/url"

const load = Effect.gen(function* () {
  const storage = yield* StorageService
  yield* ensurePrivacyMigrated(storage)
  const privacy = yield* pullPrivacyFromRemote(storage).pipe(
    Effect.catchAll(() => loadPrivacy(storage)),
  )
  const debugOverlay = yield* storage
    .get<boolean>(DEBUG_OVERLAY_KEY)
    .pipe(Effect.catchAll(() => Effect.succeed(false as boolean | null)))
  return { privacy, debugOverlay: debugOverlay === true }
})

const persist = (p: Privacy) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* savePrivacy(storage, p)
    yield* pushPrivacyToRemote(p)
  })

const persistDebugOverlay = (enabled: boolean) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* storage.set(DEBUG_OVERLAY_KEY, enabled).pipe(
      Effect.catchAll(() => Effect.void),
    )
    const prefs = yield* loadPrefs(storage)
    yield* pushPrefsToRemote(prefs, { debugOverlayEnabled: enabled })
  })

export function PrivacySection() {
  const [privacy, setPrivacy] = useState<Privacy>(defaultPrivacy)
  const [newRule, setNewRule] = useState("")
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [debugOverlay, setDebugOverlay] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    runP(load)
      .then(({ privacy: p, debugOverlay: d }) => {
        setPrivacy(p)
        setDebugOverlay(d)
      })
      .catch(console.error)
      .finally(() => setLoaded(true))
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
    const result = validateDomainEntry(newRule)
    if (!result.ok) {
      setRuleError(result.error ?? "Invalid domain.")
      return
    }
    if (privacy.blocklist.includes(result.value)) {
      setRuleError("Already in the blocklist.")
      return
    }
    setRuleError(null)
    update({ ...privacy, blocklist: [...privacy.blocklist, result.value] })
    setNewRule("")
  }

  const handleRemove = (rule: string) =>
    update({
      ...privacy,
      blocklist: privacy.blocklist.filter((r) => r !== rule),
    })

  // Privacy state is loaded lazily (and over the network) when this tab opens,
  // so render a shape-matched skeleton until it resolves — otherwise the
  // hard-coded defaults flash on screen before the real values arrive.
  if (!loaded) return <PrivacySectionSkeleton />

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
      <p class="mb-3 text-[12.5px] leading-relaxed text-muted">
        When enabled, URLs visited during a focus session are sent to the server
        and classified by AI to surface distractions and recommendations.
        Hostnames in the blocklist below are never sent.
      </p>

      <div class="mb-4 flex items-center justify-between">
        <span class="text-[13px] text-ink-2">
          {privacy.trackUrls ? "Tracking enabled" : "Tracking disabled"}
        </span>
        <Toggle
          enabled={privacy.trackUrls}
          onToggle={handleToggle}
          ariaLabel="Toggle URL tracking"
        />
      </div>

      <div class="mb-2">
        <MonoLabel as="div">Blocklist</MonoLabel>
      </div>
      <div class="mb-2 flex items-center gap-2">
        <input
          type="text"
          placeholder="example.com"
          value={newRule}
          onInput={(e) => {
            setNewRule((e.currentTarget as HTMLInputElement).value)
            if (ruleError) setRuleError(null)
          }}
          onKeyDown={(e) => {
            if ((e as KeyboardEvent).key === "Enter") handleAdd()
          }}
          class={`flex-1 rounded-control border bg-paper-2 px-2 py-1 font-mono text-[11px] text-ink placeholder:text-muted-2 outline-none focus:bg-paper focus:ring-[3px] focus:ring-amber/15 ${
            ruleError
              ? "border-clay-ink focus:border-clay-ink"
              : "border-rule-2 focus:border-amber-deep"
          }`}
        />
        <Button onClick={handleAdd} variant="ghost" size="sm">
          <Plus size={12} strokeWidth={1.8} /> Add
        </Button>
      </div>
      {ruleError && (
        <p class="mb-2 text-[11px] text-clay-ink">{ruleError}</p>
      )}
      {privacy.blocklist.length === 0 ? (
        <p class="text-[12px] text-muted">No domains blocked.</p>
      ) : (
        <ul class="grid grid-cols-2 gap-1.5">
          {privacy.blocklist.map((rule) => (
            <li
              key={rule}
              class="flex items-center justify-between gap-1 rounded-control border border-rule bg-paper-2 px-2 py-1 text-[11px]"
            >
              <span class="truncate font-mono text-ink-2">{rule}</span>
              <button
                type="button"
                onClick={() => handleRemove(rule)}
                aria-label={`Remove ${rule}`}
                class="shrink-0 rounded-md p-0.5 text-muted transition-colors hover:bg-clay-soft hover:text-clay-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep/40"
              >
                <Trash2 size={11} strokeWidth={1.7} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div class="mt-5 border-t border-rule pt-4">
        <h3 class="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
          <Bug size={13} strokeWidth={1.7} class="text-muted" /> Debug overlay
        </h3>
        <p class="mb-3 text-[12px] leading-relaxed text-muted">
          Shows a floating panel on every page during a focus session with the
          tracker pipeline in real time (navigation, buffer adds, flush
          results, errors). Useful for debugging — leave off in normal use.
        </p>
        <div class="flex items-center justify-between">
          <span class="text-[13px] text-ink-2">
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

/**
 * Placeholder that mirrors {@link PrivacySection}'s layout (header, description,
 * tracking toggle, blocklist, debug section) so swapping in the real content
 * causes no layout shift. Toggle pills use the `md` Toggle track size (h-7 w-12).
 */
function PrivacySectionSkeleton() {
  return (
    <Surface>
      {/* URL tracking header */}
      <div class="mb-3 flex items-center gap-2">
        <Skeleton class="h-3.5 w-3.5 rounded" />
        <Skeleton class="h-4 w-24" />
      </div>
      {/* description */}
      <div class="mb-4 flex flex-col gap-1.5">
        <Skeleton class="h-3 w-full" />
        <Skeleton class="h-3 w-11/12" />
        <Skeleton class="h-3 w-2/3" />
      </div>
      {/* tracking toggle row */}
      <div class="mb-4 flex items-center justify-between">
        <Skeleton class="h-3.5 w-28" />
        <Skeleton class="h-7 w-12 rounded-full" />
      </div>
      {/* blocklist label */}
      <Skeleton class="mb-2 h-2.5 w-16" />
      {/* add-rule input row */}
      <div class="mb-2 flex items-center gap-2">
        <Skeleton class="h-7 flex-1 rounded-control" />
        <Skeleton class="h-7 w-16 rounded-control" />
      </div>
      {/* blocklist chips */}
      <ul class="grid grid-cols-2 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} class="h-7 rounded-control" />
        ))}
      </ul>
      {/* debug overlay section */}
      <div class="mt-5 border-t border-rule pt-4">
        <div class="mb-1 flex items-center gap-2">
          <Skeleton class="h-3 w-3 rounded" />
          <Skeleton class="h-3.5 w-28" />
        </div>
        <div class="mb-3 flex flex-col gap-1.5">
          <Skeleton class="h-3 w-full" />
          <Skeleton class="h-3 w-3/4" />
        </div>
        <div class="flex items-center justify-between">
          <Skeleton class="h-3.5 w-28" />
          <Skeleton class="h-7 w-12 rounded-full" />
        </div>
      </div>
    </Surface>
  )
}
