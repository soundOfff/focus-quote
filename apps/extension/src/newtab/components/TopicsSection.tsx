import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import { ImagePlus, Layers, Loader2, Timer, Trash2, X } from "lucide-preact"
import { ApiService } from "../../services/api"
import { runP } from "../runtime"
import type { Topic } from "@focus-quote/shared"
import { Button, SectionHeader, Surface } from "../../ui/primitives"
import { useToast } from "../../ui/Toast"

const loadTopics = Effect.gen(function* () {
  const api = yield* ApiService
  const res = yield* api
    .listTopics()
    .pipe(Effect.catchAll(() => Effect.succeed({ topics: [] as Topic[] })))
  return res.topics
})

interface TopicMediaItem {
  id: string
  fileId: string
  note: string | null
  createdAt: string
  mimeType: string
  dataBase64: string
}

const loadTopicMedia = (label: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    const res = yield* api
      .listTopicMedia(label)
      .pipe(Effect.catchAll(() => Effect.succeed({ items: [] as TopicMediaItem[] })))
    return res.items as TopicMediaItem[]
  })

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read"))
    reader.readAsDataURL(file)
  })

const uploadAndAttach = (label: string, file: File) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    const dataUrl = yield* Effect.tryPromise(() => fileToDataUrl(file))
    const base64 = dataUrl.split(",")[1] ?? ""
    const uploaded = yield* api.uploadMedia({
      kind: "screenshot",
      mimeType: file.type,
      dataBase64: base64,
      byteSize: file.size,
      sessionId: null,
    })
    yield* api.attachTopicMedia(label, { fileId: uploaded.file.id, note: null })
  })

const detachMedia = (label: string, mediaId: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    yield* api
      .deleteTopicMedia(label, mediaId)
      .pipe(Effect.catchAll(() => Effect.void))
  })

const fmtHours = (ms: number): string => {
  if (ms < 60_000) return "<1m"
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  const hours = ms / 3_600_000
  if (hours < 10) return `${hours.toFixed(1)}h`
  return `${Math.round(hours)}h`
}

const fmtRelative = (iso: string): string => {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = now - then
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  const days = Math.round(diff / 86_400_000)
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.round(days / 7)}w ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function TopicsSection() {
  const [topics, setTopics] = useState<ReadonlyArray<Topic>>([])
  const [ready, setReady] = useState(false)
  const [openTopic, setOpenTopic] = useState<string | null>(null)
  const [media, setMedia] = useState<ReadonlyArray<TopicMediaItem>>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    runP(loadTopics)
      .then((t) => {
        setTopics(t)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  const visibleTopics = useMemo(() => topics.slice(0, 9), [topics])

  const open = (label: string) => {
    setOpenTopic(label)
    setMedia([])
    setMediaLoading(true)
    runP(loadTopicMedia(label))
      .then((items) => setMedia(items))
      .catch(() => setMedia([]))
      .finally(() => setMediaLoading(false))
  }

  const close = () => {
    setOpenTopic(null)
    setMedia([])
  }

  const onPick = (e: Event) => {
    if (!openTopic) return
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("PNG / JPEG / WEBP only.")
      return
    }
    setBusy(true)
    runP(uploadAndAttach(openTopic, file))
      .then(() => {
        toast.success("Screenshot attached.")
        return runP(loadTopicMedia(openTopic))
      })
      .then((items) => {
        if (items) setMedia(items)
      })
      .catch((err) => {
        console.error("[FocusQuote] attach topic media:", err)
        toast.error("Couldn't attach screenshot.")
      })
      .finally(() => setBusy(false))
  }

  const handleDetach = (mediaId: string) => {
    if (!openTopic) return
    setMedia((prev) => prev.filter((m) => m.id !== mediaId))
    runP(detachMedia(openTopic, mediaId)).catch(() => {})
  }

  if (!ready) return null
  if (topics.length === 0) return null

  return (
    <section class="flex flex-col gap-3">
      <SectionHeader
        title="Topics"
        icon={<Layers size={14} class="text-mute" />}
      />
      <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
        {visibleTopics.map((t) => (
          <button
            type="button"
            key={t.name}
            onClick={() => (openTopic === t.name ? close() : open(t.name))}
            class="rounded-md border border-hairline bg-surface p-3 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/70"
            aria-expanded={openTopic === t.name}
          >
            <div
              class="mb-1 truncate text-sm font-medium text-ink"
              title={t.name}
            >
              {t.name}
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-mute">
              <span class="tabular-nums">
                {t.sessionCount} session{t.sessionCount === 1 ? "" : "s"}
              </span>
              <span class="inline-flex items-center gap-0.5 tabular-nums">
                <Timer size={10} /> {fmtHours(t.totalActualMs)}
              </span>
              <span class="tabular-nums">{fmtRelative(t.lastUsedAt)}</span>
            </div>
          </button>
        ))}
      </div>

      {openTopic && (
        <Surface>
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-ink">{openTopic}</h3>
            <div class="flex items-center gap-2">
              <label class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-hairline px-2.5 py-1 text-xs text-body hover:bg-surface-soft">
                {busy ? (
                  <>
                    <Loader2 size={12} class="animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <ImagePlus size={12} /> Attach screenshot
                  </>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="hidden"
                  onInput={onPick}
                  disabled={busy}
                />
              </label>
              <Button onClick={close} variant="ghost" size="sm" aria-label="Close">
                <X size={12} />
              </Button>
            </div>
          </div>
          <p class="mt-1 text-xs text-mute">
            Attach screenshots so future recall + reading recommendations can
            use what you captured as context.
          </p>

          <div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            {mediaLoading ? (
              <p class="col-span-full text-xs text-mute">Loading…</p>
            ) : media.length === 0 ? (
              <p class="col-span-full text-xs text-mute">
                No screenshots yet.
              </p>
            ) : (
              media.map((m) => (
                <figure
                  key={m.id}
                  class="group relative overflow-hidden rounded-md border border-hairline-soft bg-surface-doc"
                >
                  <img
                    src={`data:${m.mimeType};base64,${m.dataBase64}`}
                    alt=""
                    class="block h-32 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleDetach(m.id)}
                    aria-label="Remove screenshot"
                    class="absolute right-1 top-1 rounded bg-surface/90 p-1 opacity-0 transition-opacity hover:bg-surface group-hover:opacity-100"
                  >
                    <Trash2 size={12} class="text-accent-red" />
                  </button>
                </figure>
              ))
            )}
          </div>
        </Surface>
      )}
    </section>
  )
}
