import { Effect } from "effect"
import { useEffect, useRef, useState } from "preact/hooks"
import { Briefcase, FileText, Plus, Search, Trash2, User } from "lucide-preact"
import {
  Badge,
  Button,
  EmptyState,
  MonoLabel,
  Segmented,
  SkeletonCard,
} from "../../ui/primitives"
import { StorageService } from "../../services/storage"
import {
  byCategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  defaultJobProfile,
  isAnswered,
  loadJobProfile,
  newCustomId,
  saveJobProfile,
  type AnswerCategory,
  type AnswerTemplate,
  type JobProfile,
} from "../../shared/job-profile"
import { runP } from "../runtime"

const CV_ID = "cv" as const

const inputClass =
  "rounded-control border border-rule-2 bg-paper-2 px-3 py-2 text-[13px] text-ink placeholder:text-muted-2 outline-none focus:border-amber-deep focus:bg-paper focus:ring-[3px] focus:ring-amber/15"

const loadJobProfileEff = Effect.gen(function* () {
  const storage = yield* StorageService
  return yield* loadJobProfile(storage)
})

const persistJobProfileEff = (next: JobProfile) =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    yield* saveJobProfile(storage, next)
  })

type SaveStatus = "idle" | "saving" | "saved" | "error"

/** A small status dot: filled accent-green when answered, hollow ring otherwise. */
function StatusDot({ answered }: { answered: boolean }) {
  return (
    <span
      aria-hidden
      class={
        answered
          ? "h-2 w-2 shrink-0 rounded-full bg-accent-green"
          : "h-2 w-2 shrink-0 rounded-full border border-muted-2"
      }
    />
  )
}

export function JobApplicationSection() {
  const [profile, setProfile] = useState<JobProfile>(defaultJobProfile)
  const [loaded, setLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  // Local-only UI state. "cv" is the sentinel for the CV/résumé editor.
  const [selectedId, setSelectedId] = useState<string>(CV_ID)
  const [search, setSearch] = useState("")

  const saveTimer = useRef<number | null>(null)
  // Holds the latest not-yet-persisted profile so we can flush it on blur,
  // tab-switch unmount, or page hide instead of dropping the pending write.
  const pendingRef = useRef<JobProfile | null>(null)

  useEffect(() => {
    runP(loadJobProfileEff)
      .then((p) => setProfile(p))
      .catch((e) => console.error("[FocusQuote] load job profile:", e))
      .finally(() => setLoaded(true))
  }, [])

  // Persist without touching component state — safe to call during unmount /
  // pagehide, when setState would no-op anyway.
  const persistNow = (next: JobProfile) =>
    runP(persistJobProfileEff(next)).catch((e) =>
      console.error("[FocusQuote] save job profile:", e),
    )

  const flushSave = (next: JobProfile) => {
    setSaveStatus("saving")
    runP(persistJobProfileEff(next))
      .then(() => {
        setSaveStatus("saved")
        setTimeout(() => setSaveStatus("idle"), 1200)
      })
      .catch((e) => {
        console.error("[FocusQuote] save job profile:", e)
        setSaveStatus("error")
        setTimeout(() => setSaveStatus("idle"), 3000)
      })
  }

  const update = (next: JobProfile) => {
    setProfile(next)
    pendingRef.current = next
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      pendingRef.current = null
      flushSave(next)
    }, 250)
  }

  // Flush a pending write immediately (used on field blur, while mounted).
  const flushPending = () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const next = pendingRef.current
    if (next) {
      pendingRef.current = null
      flushSave(next)
    }
  }

  // Don't lose the last <250ms of edits. TabPanel unmounts inactive tabs, so a
  // tab switch mid-debounce would otherwise drop the write; pagehide/visibility
  // cover closing the options page. chrome.storage.local.set is async so
  // pagehide is best-effort, but blur + unmount cover the common cases.
  useEffect(() => {
    const flushRaw = () => {
      const next = pendingRef.current
      if (next) {
        pendingRef.current = null
        void persistNow(next)
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushRaw()
    }
    window.addEventListener("pagehide", flushRaw)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pagehide", flushRaw)
      document.removeEventListener("visibilitychange", onVisibility)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      flushRaw()
    }
  }, [])

  const query = search.trim().toLowerCase()

  const updateTemplate = (id: string, patch: Partial<AnswerTemplate>) => {
    update({
      ...profile,
      templates: profile.templates.map((t) =>
        t.id === id ? { ...t, ...patch } : t,
      ),
    })
  }

  const deleteTemplate = (id: string) => {
    update({
      ...profile,
      templates: profile.templates.filter((t) => t.id !== id),
    })
    if (selectedId === id) setSelectedId(CV_ID)
  }

  const addCustom = () => {
    const id = newCustomId(profile.templates)
    const next: AnswerTemplate = {
      id,
      category: "about",
      question: "",
      answer: "",
      custom: true,
    }
    update({ ...profile, templates: [...profile.templates, next] })
    setSelectedId(id)
    setSearch("")
  }

  const cvAdded = profile.cv.trim().length > 0
  const selected: AnswerTemplate | undefined = profile.templates.find(
    (t) => t.id === selectedId,
  )

  const saveLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Save failed"
          : "Stored only on this device"

  if (!loaded) {
    return (
      <div class="flex flex-col gap-4">
        <SkeletonCard lines={4} />
      </div>
    )
  }

  return (
    <div class="overflow-hidden rounded-md border border-hairline bg-surface">
      {/* Header band */}
      <header class="flex items-center gap-2 border-b border-hairline bg-surface-soft/40 px-4 py-3">
        <Briefcase size={16} class="text-amber-deep" />
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-semibold text-ink">Job Application</h2>
          <p class="text-xs text-mute">
            Your CV and answer bank — used to draft application answers.
          </p>
        </div>
        <span
          class={`shrink-0 font-mono text-[10.5px] uppercase tracking-mono ${
            saveStatus === "error" ? "text-accent-red" : "text-muted-2"
          }`}
        >
          {saveLabel}
        </span>
      </header>

      {/* Two-pane body */}
      <div class="flex min-h-[460px]">
        {/* LEFT RAIL */}
        <aside class="flex w-[240px] shrink-0 flex-col border-r border-hairline bg-surface-doc/40">
          {/* Search */}
          <div class="border-b border-hairline-soft p-2.5">
            <div class="relative">
              <Search
                size={13}
                class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-2"
              />
              <input
                type="search"
                value={search}
                onInput={(e) =>
                  setSearch((e.currentTarget as HTMLInputElement).value)
                }
                placeholder="Search questions"
                aria-label="Search questions"
                class={`${inputClass} w-full !py-1.5 !pl-8`}
              />
            </div>
          </div>

          {/* Scrollable list */}
          <nav class="flex-1 overflow-y-auto p-2">
            {/* Pinned CV entry — always shown */}
            <button
              type="button"
              onClick={() => setSelectedId(CV_ID)}
              class={`mb-2 flex w-full items-center gap-2 rounded-control px-2 py-2 text-left transition-colors ${
                selectedId === CV_ID
                  ? "bg-amber-soft text-amber-deep"
                  : "text-ink-2 hover:bg-surface-soft/60"
              }`}
            >
              <FileText size={15} class="shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-medium">
                  CV / Résumé
                </span>
                <span
                  class={`block text-[10.5px] ${
                    cvAdded ? "text-accent-green" : "text-muted-2"
                  }`}
                >
                  {cvAdded ? "added" : "empty"}
                </span>
              </span>
            </button>

            {/* Category groups */}
            {CATEGORY_ORDER.map((category: AnswerCategory) => {
              const all = byCategory(profile.templates, category)
              const items = query
                ? all.filter((t) => t.question.toLowerCase().includes(query))
                : all
              if (query && items.length === 0) return null
              return (
                <div key={category} class="mb-2">
                  <div class="flex items-center justify-between px-2 pb-1 pt-1.5">
                    <MonoLabel>{CATEGORY_LABELS[category]}</MonoLabel>
                    <span class="font-mono text-[10px] tabular-nums text-muted-2">
                      {items.length}
                    </span>
                  </div>
                  {items.map((t) => {
                    const active = t.id === selectedId
                    const label =
                      t.question.trim().length > 0
                        ? t.question
                        : "Untitled question"
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        class={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors ${
                          active
                            ? "bg-amber-soft text-amber-deep"
                            : "text-body hover:bg-surface-soft/60"
                        }`}
                      >
                        <StatusDot answered={isAnswered(t)} />
                        <span class="min-w-0 flex-1 truncate text-[12.5px]">
                          {label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </nav>

          {/* Pinned add button */}
          <div class="border-t border-hairline-soft p-2.5">
            <Button variant="ghost" size="sm" onClick={addCustom} class="w-full">
              <Plus size={14} />
              Add question
            </Button>
          </div>
        </aside>

        {/* RIGHT PANE — exactly one editor */}
        <section class="min-w-0 flex-1 p-5">
          {selectedId === CV_ID ? (
            <CvEditor
              cv={profile.cv}
              onChange={(cv) => update({ ...profile, cv })}
              onFlush={flushPending}
            />
          ) : selected ? (
            <QuestionEditor
              key={selected.id}
              template={selected}
              onUpdate={(patch) => updateTemplate(selected.id, patch)}
              onDelete={() => deleteTemplate(selected.id)}
              onFlush={flushPending}
            />
          ) : (
            <EmptyState
              icon={<User size={22} />}
              title="Nothing selected"
              description="Pick the CV/Résumé or a question from the list on the left to start editing."
            />
          )}
        </section>
      </div>
    </div>
  )
}

function CvEditor({
  cv,
  onChange,
  onFlush,
}: {
  cv: string
  onChange: (cv: string) => void
  onFlush: () => void
}) {
  return (
    <div class="flex h-full flex-col">
      <div class="mb-3 flex items-center gap-2">
        <FileText size={16} class="text-amber-deep" />
        <h3 class="text-sm font-semibold text-ink">CV / Résumé</h3>
      </div>
      <p class="mb-3 text-xs leading-relaxed text-mute">
        Paste your CV as plain text. It gives the assistant context when drafting
        answers.
      </p>
      <textarea
        value={cv}
        onInput={(e) => onChange((e.currentTarget as HTMLTextAreaElement).value)}
        onBlur={onFlush}
        placeholder="Paste your CV here…"
        rows={14}
        class={`${inputClass} w-full flex-1 resize-y font-mono leading-relaxed`}
      />
      <div class="mt-2 flex items-center justify-between">
        <MonoLabel tone="muted">Stored only on this device</MonoLabel>
        <span class="font-mono text-[10.5px] tabular-nums text-muted-2">
          {cv.length} chars
        </span>
      </div>
    </div>
  )
}

function QuestionEditor({
  template,
  onUpdate,
  onDelete,
  onFlush,
}: {
  template: AnswerTemplate
  onUpdate: (patch: Partial<AnswerTemplate>) => void
  onDelete: () => void
  onFlush: () => void
}) {
  const answered = isAnswered(template)
  return (
    <div class="flex h-full flex-col">
      {/* Top meta row */}
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          {template.custom ? (
            <Badge tone="info">Custom</Badge>
          ) : (
            <Badge tone="neutral">Default</Badge>
          )}
          <Badge tone={answered ? "success" : "neutral"}>
            {answered ? "Answered" : "Unanswered"}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 size={13} />
          Delete
        </Button>
      </div>

      {/* Question text */}
      <label class="mb-3 block">
        <MonoLabel as="div" class="mb-1.5">
          Question
        </MonoLabel>
        <input
          type="text"
          value={template.question}
          onInput={(e) =>
            onUpdate({ question: (e.currentTarget as HTMLInputElement).value })
          }
          onBlur={onFlush}
          placeholder="Interview question…"
          class={`${inputClass} w-full text-[14px] font-medium`}
        />
      </label>

      {/* Category */}
      <div class="mb-3">
        <MonoLabel as="div" class="mb-1.5">
          Category
        </MonoLabel>
        <Segmented<AnswerCategory>
          size="sm"
          variant="amber"
          value={template.category}
          onChange={(category) => onUpdate({ category })}
          items={CATEGORY_ORDER.map((c) => ({
            value: c,
            label: CATEGORY_LABELS[c],
          }))}
        />
      </div>

      {/* Answer */}
      <label class="flex flex-1 flex-col">
        <MonoLabel as="div" class="mb-1.5">
          Your answer
        </MonoLabel>
        <textarea
          value={template.answer}
          onInput={(e) =>
            onUpdate({ answer: (e.currentTarget as HTMLTextAreaElement).value })
          }
          onBlur={onFlush}
          placeholder="Write your answer here…"
          rows={9}
          class={`${inputClass} w-full flex-1 resize-y leading-relaxed`}
        />
      </label>
    </div>
  )
}
