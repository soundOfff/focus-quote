import { useEffect, useMemo, useState } from "preact/hooks"
import { Effect } from "effect"
import {
  ImagePlus,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Timer,
  Trash2,
  X,
} from "lucide-preact"
import { ApiService } from "../../services/api"
import { runP } from "../runtime"
import type { Topic, VaultItem } from "@focus-quote/shared"
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

const renameTopic = (id: string, name: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    return yield* api.renameTopic(id, name)
  })

const loadVault = (topicId: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    const res = yield* api
      .listTopicVault(topicId)
      .pipe(Effect.catchAll(() => Effect.succeed({ items: [] as VaultItem[] })))
    return res.items as VaultItem[]
  })

const addVaultNote = (topicId: string, body: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    return yield* api.addTopicVaultItem(topicId, { kind: "note", body })
  })

const deleteVaultItem = (topicId: string, itemId: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    yield* api
      .deleteTopicVaultItem(topicId, itemId)
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
  const [openTopicId, setOpenTopicId] = useState<string | null>(null)
  const [media, setMedia] = useState<ReadonlyArray<TopicMediaItem>>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState<ReadonlyArray<VaultItem>>([])
  const [noteDraft, setNoteDraft] = useState("")
  const [addingNote, setAddingNote] = useState(false)
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

  const open = (topic: Topic) => {
    setOpenTopic(topic.name)
    setOpenTopicId(topic.id)
    setMedia([])
    setNotes([])
    setNoteDraft("")
    setMediaLoading(true)
    runP(loadTopicMedia(topic.name))
      .then((items) => setMedia(items))
      .catch(() => setMedia([]))
      .finally(() => setMediaLoading(false))
    runP(loadVault(topic.id))
      .then((items) => setNotes(items))
      .catch(() => setNotes([]))
  }

  const close = () => {
    setOpenTopic(null)
    setOpenTopicId(null)
    setMedia([])
    setNotes([])
    setNoteDraft("")
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

  const handleRename = () => {
    if (!openTopic) return
    const current = openTopic
    const target = topics.find((t) => t.name === current)
    if (!target) return
    const next = window.prompt("Rename topic", current)?.trim()
    if (!next || next === current) return
    runP(renameTopic(target.id, next))
      .then(() => {
        toast.success("Topic renamed.")
        setOpenTopic(next)
        return runP(loadTopics)
      })
      .then((t) => {
        if (t) setTopics(t)
        return runP(loadTopicMedia(next))
      })
      .then((items) => {
        if (items) setMedia(items)
      })
      .catch((err) => {
        console.error("[FocusQuote] rename topic:", err)
        toast.error("Couldn't rename topic.")
      })
  }

  const handleAddNote = () => {
    const topicId = openTopicId
    const body = noteDraft.trim()
    if (!topicId || !body || addingNote) return
    setAddingNote(true)
    runP(addVaultNote(topicId, body))
      .then(() => {
        setNoteDraft("")
        return runP(loadVault(topicId))
      })
      .then((items) => {
        if (items) setNotes(items)
      })
      .catch((err) => {
        console.error("[FocusQuote] add vault note:", err)
        toast.error("Couldn't save note.")
      })
      .finally(() => setAddingNote(false))
  }

  const handleDeleteNote = (itemId: string) => {
    if (!openTopicId) return
    setNotes((prev) => prev.filter((n) => n.id !== itemId))
    runP(deleteVaultItem(openTopicId, itemId)).catch(() => {})
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
            onClick={() => (openTopic === t.name ? close() : open(t))}
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
              <Button
                onClick={handleRename}
                variant="ghost"
                size="sm"
                aria-label="Rename topic"
              >
                <Pencil size={12} />
              </Button>
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

          <div class="mt-4 border-t border-hairline-soft pt-3">
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">
              Notes
            </h4>
            <div class="flex flex-col gap-1.5">
              {notes.length === 0 ? (
                <p class="text-xs text-mute">No notes yet.</p>
              ) : (
                notes.map((n) => (
                  <div
                    key={n.id}
                    class="group flex items-start justify-between gap-2 rounded-md border border-hairline-soft bg-surface-doc px-2.5 py-1.5"
                  >
                    {n.kind === "url" ? (
                      <a
                        href={n.body}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="min-w-0 truncate text-xs font-medium text-link-blue hover:underline"
                        title={n.body}
                      >
                        {n.title || n.body}
                      </a>
                    ) : (
                      <p class="min-w-0 whitespace-pre-wrap break-words text-xs text-body">
                        {n.body}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(n.id)}
                      aria-label="Delete note"
                      class="shrink-0 rounded p-0.5 text-mute opacity-0 transition-opacity hover:text-accent-red group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div class="mt-2 flex items-start gap-2">
              <textarea
                value={noteDraft}
                placeholder="Add a note to this topic's vault…"
                rows={2}
                onInput={(e) =>
                  setNoteDraft((e.currentTarget as HTMLTextAreaElement).value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleAddNote()
                  }
                }}
                class="min-h-[2.25rem] flex-1 resize-y rounded-md border border-hairline-soft bg-canvas px-2 py-1.5 text-xs text-ink outline-none focus:ring-1 focus:ring-focus-ring/70"
              />
              <Button
                onClick={handleAddNote}
                variant="ghost"
                size="sm"
                disabled={addingNote || !noteDraft.trim()}
                aria-label="Add note"
                class="gap-1"
              >
                <Plus size={12} /> Add
              </Button>
            </div>
          </div>
        </Surface>
      )}
    </section>
  )
}
