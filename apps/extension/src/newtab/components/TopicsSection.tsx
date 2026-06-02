import { useEffect, useRef, useState } from "preact/hooks"
import { Effect } from "effect"
import {
  Clock,
  FolderInput,
  ImagePlus,
  Layers,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-preact"
import { ApiService } from "../../services/api"
import { runP } from "../runtime"
import { normalizeVaultUrl } from "../../shared/url"
import type { Topic, VaultItem } from "@focus-quote/shared"
import { Button, MonoLabel } from "../../ui/primitives"
import { useToast } from "../../ui/Toast"

const loadTopics = Effect.gen(function* () {
  const api = yield* ApiService
  const res = yield* api
    .listTopics()
    .pipe(Effect.catchAll(() => Effect.succeed({ topics: [] as Topic[] })))
  return res.topics
})

const createTopic = (name: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    return yield* api.createTopic(name)
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

const deleteTopic = (id: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    return yield* api.deleteTopic(id)
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

const addVaultLink = (topicId: string, url: string) =>
  Effect.gen(function* () {
    const api = yield* ApiService
    return yield* api.addTopicVaultItem(topicId, { kind: "url", body: url })
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

// Mono "·" separator, muted-2 per the editorial reference.
function Sep() {
  return <span class="text-muted-2">·</span>
}

// Lazily fetches an image vault item's bytes from the media bucket (the bearer
// token lives in the SW, so we can't point an <img src> straight at the API —
// we fetch the data URL through the api service instead).
function VaultImage({
  mediaFileId,
  alt,
}: {
  mediaFileId: string
  alt: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    runP(
      Effect.gen(function* () {
        const api = yield* ApiService
        return yield* api.getMedia(mediaFileId)
      }),
    )
      .then((res) => {
        if (alive) {
          setSrc(`data:${res.file.mimeType};base64,${res.file.dataBase64}`)
        }
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [mediaFileId])
  if (failed) {
    return <span class="text-[11px] text-muted">Image unavailable</span>
  }
  if (!src) {
    return (
      <div class="flex h-16 w-24 items-center justify-center rounded-control border border-rule-2 bg-paper">
        <Loader2 size={14} class="animate-spin text-muted" aria-hidden />
      </div>
    )
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" class="min-w-0">
      <img
        src={src}
        alt={alt}
        class="max-h-28 rounded-control border border-rule-2 object-contain"
      />
    </a>
  )
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
  const [movingId, setMovingId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [addingNote, setAddingNote] = useState(false)
  const [linkDraft, setLinkDraft] = useState("")
  const [addingLink, setAddingLink] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [savingNew, setSavingNew] = useState(false)
  const newInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const toast = useToast()

  useEffect(() => {
    runP(loadTopics)
      .then((t) => {
        setTopics(t)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  useEffect(() => {
    if (creating) newInputRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus()
  }, [renaming])

  const open = (topic: Topic) => {
    setRenaming(false)
    setConfirmDelete(false)
    setOpenTopic(topic.name)
    setOpenTopicId(topic.id)
    setMedia([])
    setNotes([])
    setNoteDraft("")
    setLinkDraft("")
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
    setRenaming(false)
    setConfirmDelete(false)
    setOpenTopic(null)
    setOpenTopicId(null)
    setMedia([])
    setNotes([])
    setNoteDraft("")
    setLinkDraft("")
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

  const startRename = () => {
    if (!openTopic) return
    setRenameDraft(openTopic)
    setRenaming(true)
  }

  const commitRename = () => {
    if (!openTopic) return
    const current = openTopic
    const target = topics.find((t) => t.name === current)
    const next = renameDraft.trim()
    setRenaming(false)
    if (!target || !next || next === current) return
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

  const handleDeleteTopic = () => {
    const id = openTopicId
    if (!id || deleting) return
    setDeleting(true)
    runP(deleteTopic(id))
      .then(() => {
        toast.success("Topic deleted.")
        setTopics((prev) => prev.filter((t) => t.id !== id))
        close()
      })
      .catch((err) => {
        console.error("[FocusQuote] delete topic:", err)
        toast.error("Couldn't delete topic.")
      })
      .finally(() => {
        setDeleting(false)
        setConfirmDelete(false)
      })
  }

  const startCreate = () => {
    setNewName("")
    setCreating(true)
  }

  const cancelCreate = () => {
    setCreating(false)
    setNewName("")
  }

  const commitCreate = () => {
    const name = newName.trim()
    if (savingNew) return
    if (!name) {
      cancelCreate()
      return
    }
    setSavingNew(true)
    runP(createTopic(name))
      .then((res) => {
        const created = res.topic
        // Append, never prepend: the list is ordered created_at ASC, so the
        // newest topic belongs at the end and the rest must not reorder.
        setTopics((prev) => [...prev.filter((t) => t.id !== created.id), created])
        setCreating(false)
        setNewName("")
        open(created)
      })
      .catch((err) => {
        console.error("[FocusQuote] create topic:", err)
        toast.error("Couldn't create topic. That name may already exist.")
      })
      .finally(() => setSavingNew(false))
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

  const handleAddLink = () => {
    const topicId = openTopicId
    if (!topicId || addingLink) return
    const url = normalizeVaultUrl(linkDraft)
    if (!url) {
      toast.error("Enter a valid link, like example.com/page.")
      return
    }
    setAddingLink(true)
    runP(addVaultLink(topicId, url))
      .then(() => {
        setLinkDraft("")
        return runP(loadVault(topicId))
      })
      .then((items) => {
        if (items) setNotes(items)
      })
      .catch((err) => {
        console.error("[FocusQuote] add vault link:", err)
        toast.error("Couldn't save link.")
      })
      .finally(() => setAddingLink(false))
  }

  const handleDeleteNote = (itemId: string) => {
    if (!openTopicId) return
    setNotes((prev) => prev.filter((n) => n.id !== itemId))
    runP(deleteVaultItem(openTopicId, itemId)).catch(() => {})
  }

  const handleMove = (itemId: string, targetTopicId: string) => {
    if (!openTopicId || !targetTopicId || targetTopicId === openTopicId) {
      setMovingId(null)
      return
    }
    // Optimistically drop the item from this topic — it now lives elsewhere.
    setNotes((prev) => prev.filter((n) => n.id !== itemId))
    setMovingId(null)
    runP(
      Effect.gen(function* () {
        const api = yield* ApiService
        return yield* api.moveTopicVaultItem(openTopicId, itemId, targetTopicId)
      }),
    )
      .then(() => toast.success("Moved to topic."))
      .catch(() => {
        toast.error("Couldn't move item.")
        // Reload to resync after a failed optimistic removal.
        runP(loadVault(openTopicId))
          .then((items) => setNotes(items))
          .catch(() => {})
      })
  }

  if (!ready) return null

  return (
    <section class="flex flex-col gap-5">
      {/* A) Header — component owns the serif page title */}
      <h1 class="font-serif text-[30px] font-semibold leading-[1.05] tracking-[-0.02em] text-ink">
        Topics
      </h1>

      {/* B) Topics strip */}
      <div class="flex flex-col gap-3">
        <MonoLabel class="inline-flex items-center gap-[7px] tracking-mono-wide">
          <Layers size={14} strokeWidth={1.6} class="text-muted-2" aria-hidden />
          Topics
        </MonoLabel>

        <div class="flex flex-wrap gap-2.5">
          {topics.map((t) => {
            const selected = openTopic === t.name
            return (
              <button
                type="button"
                key={t.id}
                aria-pressed={selected}
                onClick={() => (selected ? close() : open(t))}
                class={`flex w-[232px] flex-col gap-[7px] rounded-card border bg-paper p-3 text-left transition-[border-color,background-color,box-shadow] duration-150 focus:outline-none focus-visible:border-amber-deep focus-visible:ring-[3px] focus-visible:ring-amber/20 ${
                  selected
                    ? "border-amber-deep ring-[3px] ring-amber/20"
                    : "border-rule-2 hover:border-muted-2 hover:bg-paper-2"
                }`}
              >
                <span
                  class="truncate font-serif text-base font-semibold leading-[1.15] tracking-[-0.01em] text-ink"
                  title={t.name}
                >
                  {t.name}
                </span>
                <span class="flex flex-wrap items-center gap-[9px] font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                  <span class="tabular-nums">
                    {t.sessionCount} session{t.sessionCount === 1 ? "" : "s"}
                  </span>
                  <Sep />
                  <span class="inline-flex items-center gap-1 tabular-nums">
                    <Clock size={11} strokeWidth={1.7} class="text-muted-2" aria-hidden />
                    {fmtHours(t.totalActualMs)}
                  </span>
                  <Sep />
                  <span class="tabular-nums">{fmtRelative(t.lastUsedAt)}</span>
                </span>
              </button>
            )
          })}

          {/* "+ new topic" card — dashed, neutral; reveals inline input */}
          {creating ? (
            <div class="flex w-[232px] items-center rounded-card border border-dashed border-rule-2 bg-paper px-3 py-2">
              <input
                ref={newInputRef}
                type="text"
                value={newName}
                placeholder="New topic name…"
                aria-label="New topic name"
                disabled={savingNew}
                onInput={(e) => setNewName((e.currentTarget as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commitCreate()
                  } else if (e.key === "Escape") {
                    e.preventDefault()
                    cancelCreate()
                  }
                }}
                class="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted-2 focus:outline-none"
              />
              {savingNew && (
                <Loader2 size={14} class="ml-2 shrink-0 animate-spin text-muted" aria-hidden />
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={startCreate}
              aria-label="New topic"
              class="flex w-[232px] h-16 items-center justify-center self-stretch rounded-card border border-dashed border-rule-2 bg-transparent text-muted-2 transition-[color,border-color,background-color] duration-150 hover:border-amber hover:bg-paper-2 hover:text-amber-deep focus:outline-none focus-visible:border-amber-deep focus-visible:ring-[3px] focus-visible:ring-amber/20"
            >
              <Plus size={16} strokeWidth={1.8} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* C) Detail panel */}
      {openTopic && (
        <section class="rounded-card border border-rule bg-paper-2 p-5">
          <div class="flex items-start justify-between gap-4">
            {renaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameDraft}
                aria-label="Rename topic"
                onInput={(e) => setRenameDraft((e.currentTarget as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commitRename()
                  } else if (e.key === "Escape") {
                    e.preventDefault()
                    setRenaming(false)
                  }
                }}
                onBlur={commitRename}
                class="min-w-0 flex-1 rounded-control border border-rule-2 bg-paper px-2.5 py-1 font-serif text-[20px] font-semibold leading-[1.1] tracking-[-0.01em] text-ink focus:border-amber-deep focus:outline-none focus:ring-[3px] focus:ring-amber/18"
              />
            ) : (
              <h2 class="min-w-0 break-words font-serif text-[20px] font-semibold leading-[1.1] tracking-[-0.01em] text-ink">
                {openTopic}
              </h2>
            )}
            <div class="flex shrink-0 items-center gap-1.5">
              <label
                class={`inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-amber-deep bg-amber-gradient px-3 text-xs font-semibold text-[#2A1A05] shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_1px_2px_rgba(40,30,15,0.15)] transition-[filter] duration-150 hover:brightness-[1.03] active:brightness-[0.97] focus-within:outline-none focus-within:ring-[3px] focus-within:ring-amber/20 ${
                  busy ? "cursor-wait opacity-80" : ""
                }`}
              >
                {busy ? (
                  <>
                    <Loader2 size={14} class="animate-spin" aria-hidden /> Uploading…
                  </>
                ) : (
                  <>
                    <ImagePlus size={14} strokeWidth={1.7} aria-hidden /> Attach screenshot
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
              <button
                type="button"
                onClick={startRename}
                aria-label="Rename topic"
                class="grid h-8 w-8 place-items-center rounded-control border border-rule-2 bg-paper text-ink-2 transition-[color,background-color,border-color] duration-150 hover:border-muted-2 hover:bg-paper-2 hover:text-ink focus:outline-none focus-visible:border-amber-deep focus-visible:ring-[3px] focus-visible:ring-amber/20"
              >
                <Pencil size={15} strokeWidth={1.6} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete topic"
                class="grid h-8 w-8 place-items-center rounded-control border border-rule-2 bg-paper text-ink-2 transition-[color,background-color,border-color] duration-150 hover:border-blue-ink/40 hover:bg-paper-2 hover:text-blue-ink focus:outline-none focus-visible:border-amber-deep focus-visible:ring-[3px] focus-visible:ring-amber/20"
              >
                <Trash2 size={15} strokeWidth={1.6} aria-hidden />
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={close}
                aria-label="Close"
              >
                <X size={15} strokeWidth={1.8} aria-hidden />
              </Button>
            </div>
          </div>

          {confirmDelete && (
            <div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-control border border-blue-ink/30 bg-paper px-3.5 py-2.5">
              <p class="text-[12.5px] leading-[1.45] text-ink-2">
                Delete <span class="font-semibold text-ink">{openTopic}</span>? Its
                saved notes, links &amp; screenshots are removed. Past sessions are
                kept, just unlinked.
              </p>
              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  class="inline-flex h-8 items-center rounded-control border border-rule-2 bg-paper px-3 text-[12.5px] font-medium text-ink-2 transition-[color,background-color,border-color] duration-150 hover:border-muted-2 hover:bg-paper-2 hover:text-ink focus:outline-none focus-visible:border-amber-deep focus-visible:ring-[3px] focus-visible:ring-amber/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTopic}
                  disabled={deleting}
                  class="inline-flex h-8 items-center gap-1.5 rounded-control border border-blue-ink bg-blue-ink px-3 text-[12.5px] font-semibold text-paper transition-[filter] duration-150 hover:brightness-110 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting ? (
                    <>
                      <Loader2 size={13} class="animate-spin" aria-hidden /> Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 size={13} strokeWidth={1.8} aria-hidden /> Delete topic
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <p class="mb-4 mt-2.5 max-w-[64ch] text-[13px] leading-[1.55] text-ink-2">
            Attach screenshots so future recall &amp; reading recommendations can
            use what you captured as context.
          </p>

          {/* Screenshots */}
          {mediaLoading ? (
            <p class="text-[12.5px] text-muted">Loading…</p>
          ) : media.length === 0 ? (
            <div class="flex items-center gap-2.5 text-[12.5px] text-muted">
              <span class="grid h-[30px] w-[30px] place-items-center rounded-control border border-dashed border-rule-2 text-muted-2">
                <ImagePlus size={15} strokeWidth={1.6} aria-hidden />
              </span>
              <span>No screenshots yet.</span>
            </div>
          ) : (
            <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
              {media.map((m) => (
                <figure
                  key={m.id}
                  class="group relative overflow-hidden rounded-control border border-rule-2 bg-paper"
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
                    class="absolute right-1 top-1 rounded bg-paper/90 p-1 opacity-0 transition-opacity hover:bg-paper group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-amber/20"
                  >
                    <Trash2 size={12} class="text-blue-ink" aria-hidden />
                  </button>
                </figure>
              ))}
            </div>
          )}

          {/* Hairline divider */}
          <div class="my-4 h-px bg-rule" />

          {/* Notes & links */}
          <MonoLabel class="mb-4 inline-flex items-center tracking-mono-wide">
            Notes &amp; Links
          </MonoLabel>

          {/* {notes.length === 0 && (
            <p class="mb-3 text-[12.5px] text-muted">No notes yet.</p>
          )} */}

          {notes.length > 0 && (
            <div class="mb-3 flex flex-col gap-1.5">
              {notes.map((n) => (
                <div
                  key={n.id}
                  class="group flex items-start justify-between gap-2 rounded-control px-2.5 py-1.5 !w-[695px] border border-rule-2 bg-paper"
                >
                  <div class="min-w-0 flex-1">
                    {n.kind === "url" ? (
                      <a
                        href={n.body}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="block min-w-0 truncate text-xs font-medium text-blue-ink hover:underline"
                        title={n.body}
                      >
                        {n.title || n.body}
                      </a>
                    ) : n.kind === "image" && n.mediaFileId ? (
                      <VaultImage
                        mediaFileId={n.mediaFileId}
                        alt={n.title || "Saved image"}
                      />
                    ) : (
                      <p class="min-w-0 whitespace-pre-wrap break-words text-xs text-ink-2">
                        {n.body}
                      </p>
                    )}
                    {movingId === n.id && (
                      <div class="mt-1.5 flex items-center gap-1.5">
                        <select
                          aria-label="Move to topic"
                          onChange={(e) =>
                            handleMove(
                              n.id,
                              (e.currentTarget as HTMLSelectElement).value,
                            )
                          }
                          class="h-7 rounded-control border border-rule-2 bg-paper px-2 text-[12px] text-ink focus:border-amber-deep focus:outline-none focus:ring-[3px] focus:ring-amber/18"
                        >
                          <option value="">Move to…</option>
                          {topics
                            .filter((t) => t.id !== openTopicId)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setMovingId(null)}
                          class="rounded p-1 text-[11px] text-muted hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <div class="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setMovingId(movingId === n.id ? null : n.id)
                      }
                      aria-label="Move to another topic"
                      title="Move to another topic"
                      class="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-blue-ink group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-amber/20"
                    >
                      <FolderInput size={12} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(n.id)}
                      aria-label="Delete item"
                      class="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-blue-ink group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-amber/20"
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Note input row */}
          <div class="mb-2.5 flex items-stretch gap-2">
            <textarea
              value={noteDraft}
              placeholder="Add a note to this topic's vault…"
              aria-label="Add a note to this topic's vault"
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
              class="min-h-[60px] flex-1 resize-y rounded-control border border-rule-2 bg-paper px-3 py-2.5 text-[13px] leading-[1.5] text-ink placeholder:text-muted-2 focus:border-amber-deep focus:outline-none focus:ring-[3px] focus:ring-amber/18"
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={addingNote || !noteDraft.trim()}
              class="inline-flex items-center !h-8 gap-1.5 self-end rounded-control border border-rule-2 bg-paper px-3.5 text-[12.5px] font-medium text-ink-2 transition-[color,background-color,border-color] duration-150 hover:border-muted-2 hover:bg-paper-2 hover:text-ink focus:outline-none focus-visible:border-amber-deep focus-visible:ring-[3px] focus-visible:ring-amber/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={13} strokeWidth={1.8} class="text-muted" aria-hidden /> Add
            </button>
          </div>

          {/* Link input row — chain glyph nested inside the bordered control */}
          <div class="flex items-stretch gap-2">
            <div class="flex flex-1 items-center rounded-control border border-rule-2 bg-paper pl-[11px] transition-[border-color,box-shadow] duration-150 focus-within:border-amber-deep focus-within:ring-[3px] focus-within:ring-amber/18">
              <Link2 size={14} strokeWidth={1.6} class="shrink-0 text-muted-2" aria-hidden />
              <input
                type="url"
                value={linkDraft}
                placeholder="Save a link to this topic's vault…"
                aria-label="Save a link to this topic's vault"
                onInput={(e) =>
                  setLinkDraft((e.currentTarget as HTMLInputElement).value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddLink()
                  }
                }}
                class="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-[13px] text-ink placeholder:text-muted-2 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleAddLink}
              disabled={addingLink || !linkDraft.trim()}
              class="inline-flex items-center h-8 gap-1.5 self-end rounded-control border border-rule-2 bg-paper px-3.5 text-[12.5px] font-medium text-ink-2 transition-[color,background-color,border-color] duration-150 hover:border-muted-2 hover:bg-paper-2 hover:text-ink focus:outline-none focus-visible:border-amber-deep focus-visible:ring-[3px] focus-visible:ring-amber/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={13} strokeWidth={1.8} class="text-muted" aria-hidden /> Link
            </button>
          </div>
        </section>
      )}
    </section>
  )
}
