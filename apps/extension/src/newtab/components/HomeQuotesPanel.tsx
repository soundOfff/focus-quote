import { Effect } from "effect"
import {
  ChevronDown,
  ChevronRight,
  List,
  Network,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-preact"
import { useEffect, useMemo, useState } from "preact/hooks"
import type {
  ConsolidateProgressEvent,
  Quote,
  QuoteId,
  TagGraph,
  TagId,
} from "@focus-quote/shared"
import { QuotesService } from "../../services/quotes"
import { TagsService } from "../../services/tags"
import { runP } from "../runtime"
import {
  Button,
  EmptyState,
  Progress,
  Segmented,
  Toggle,
} from "../../ui/primitives"
import { QuotesGraph } from "./QuotesGraph"
import {
  UNTAGGED_LABEL,
  buildTagTree,
  quoteIdsForTag,
  tagsForQuote,
  untaggedQuoteIds,
  type TagSelection,
  type TagTreeNode,
} from "../../shared/tag-graph"

const EMPTY_GRAPH: TagGraph = { tags: [], edges: [], memberships: [] }

const loadData = Effect.gen(function* () {
  const quotesSvc = yield* QuotesService
  const tagsSvc = yield* TagsService
  const quotes = yield* quotesSvc.list()
  const graph = yield* tagsSvc.getGraph
  return { quotes, graph }
})

const manualTagEff = (quoteId: QuoteId, name: string) =>
  Effect.gen(function* () {
    const tags = yield* TagsService
    return yield* tags.manualTag(quoteId, name)
  })

const detachEff = (quoteId: QuoteId, tagId: TagId) =>
  Effect.gen(function* () {
    const tags = yield* TagsService
    return yield* tags.detach(quoteId, tagId)
  })

const deleteTagEff = (tagId: TagId) =>
  Effect.gen(function* () {
    const tags = yield* TagsService
    return yield* tags.deleteTag(tagId)
  })

const removeQuoteEff = (quoteId: QuoteId) =>
  Effect.gen(function* () {
    const quotes = yield* QuotesService
    return yield* quotes.remove(quoteId)
  })

const consolidateEff = (
  onProgress: (event: ConsolidateProgressEvent) => void,
) =>
  Effect.gen(function* () {
    const tags = yield* TagsService
    return yield* tags.consolidate(onProgress)
  })

/** Map a streamed progress frame to a determinate bar value + caption. */
const tidyBar = (
  e: ConsolidateProgressEvent | null,
): { value: number | null; label: string } => {
  if (!e) return { value: null, label: "Starting…" }
  switch (e.phase) {
    case "classifying":
      return { value: null, label: `Reading ${e.total} quotes…` }
    case "filing":
      return {
        value: e.total > 0 ? (e.processed / e.total) * 100 : 100,
        label: `Filed ${e.processed} / ${e.total}`,
      }
    case "restructuring":
      return { value: null, label: "Tidying tags…" }
    case "done":
      return { value: 100, label: "Done" }
  }
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ")

type QuotesView = "list" | "graph"
const VIEW_KEY = "focusquote.quotes.view"

const selectionEq = (a: TagSelection, b: TagSelection) =>
  a.kind === b.kind && (a.kind !== "tag" || a.tagId === (b as { tagId: string }).tagId)

export function HomeQuotesPanel() {
  const [quotes, setQuotes] = useState<ReadonlyArray<Quote>>([])
  const [graph, setGraph] = useState<TagGraph>(EMPTY_GRAPH)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<QuotesView>("list")
  const [selected, setSelected] = useState<TagSelection>({ kind: "all" })
  const [includeSubTags, setIncludeSubTags] = useState(true)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [taggingId, setTaggingId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState("")
  const [tidying, setTidying] = useState(false)
  const [tidyNote, setTidyNote] = useState<string | null>(null)
  const [tidyProgress, setTidyProgress] =
    useState<ConsolidateProgressEvent | null>(null)
  // Bumped to re-heat the graph layout when Tidy runs (graph view reads it).
  const [reheatSignal, setReheatSignal] = useState(0)

  const reload = () =>
    runP(loadData)
      .then(({ quotes: q, graph: g }) => {
        setQuotes(q)
        setGraph(g)
      })
      .catch(() => {})
      .finally(() => setReady(true))

  useEffect(() => {
    reload()
  }, [])

  useEffect(() => {
    chrome.storage?.local
      ?.get(VIEW_KEY)
      .then((r) => {
        const v = r?.[VIEW_KEY]
        if (v === "list" || v === "graph") setView(v)
      })
      .catch(() => {})
  }, [])

  const setViewPersist = (next: QuotesView) => {
    setView(next)
    chrome.storage?.local?.set({ [VIEW_KEY]: next }).catch(() => {})
  }

  const tree = useMemo(() => buildTagTree(graph), [graph])
  const untaggedIds = useMemo(
    () => untaggedQuoteIds(graph, quotes.map((q) => q.id)),
    [graph, quotes],
  )

  const visibleQuoteIds = useMemo<ReadonlySet<string>>(() => {
    if (selected.kind === "all") return new Set(quotes.map((q) => q.id))
    if (selected.kind === "untagged") return untaggedIds
    return quoteIdsForTag(graph, selected.tagId, includeSubTags)
  }, [selected, quotes, graph, includeSubTags, untaggedIds])

  const visible = useMemo(
    () => quotes.filter((q) => visibleQuoteIds.has(q.id)).slice(0, 50),
    [quotes, visibleQuoteIds],
  )

  const beginTagging = (id: string) => {
    setTaggingId(id)
    setTagInput("")
  }
  const commitTag = (quoteId: QuoteId) => {
    const name = tagInput.trim()
    setTaggingId(null)
    setTagInput("")
    if (!name) return
    runP(manualTagEff(quoteId, name)).then(reload).catch(() => {})
  }
  const detach = (quoteId: QuoteId, tagId: TagId) => {
    runP(detachEff(quoteId, tagId)).then(reload).catch(() => {})
  }
  // Deletes the Tag itself (and any sub-tag edges hanging off it). Quotes filed
  // only under it fall back to Untagged; child tags are promoted to roots.
  // Irreversible, so confirm first.
  const deleteTag = (tagId: TagId, name: string) => {
    if (
      !window.confirm(
        `Delete the tag "${name}"? Quotes filed only here move to Untagged and any sub-tags move up a level. This can't be undone.`,
      )
    )
      return
    if (selected.kind === "tag" && selected.tagId === tagId)
      setSelected({ kind: "all" })
    runP(deleteTagEff(tagId)).then(reload).catch(() => {})
  }
  // Deletes the Quote entirely (distinct from the per-chip ✕, which only removes
  // a tag). Irreversible, so confirm first.
  const deleteQuote = (quoteId: QuoteId) => {
    if (!window.confirm("Delete this quote? This can't be undone.")) return
    runP(removeQuoteEff(quoteId)).then(reload).catch(() => {})
  }

  const tidyNow = () => {
    setTidying(true)
    setTidyNote(null)
    setTidyProgress(null)
    setReheatSignal((n) => n + 1)
    runP(consolidateEff((e) => setTidyProgress(e)))
      .then(({ changes }) => {
        const { filed, merged, renamed, reparented } = changes
        const parts: string[] = []
        if (filed) parts.push(`${filed} filed`)
        if (merged) parts.push(`${merged} merged`)
        if (renamed) parts.push(`${renamed} renamed`)
        if (reparented) parts.push(`${reparented} re-parented`)
        setTidyNote(
          parts.length === 0
            ? "Already tidy — no changes."
            : `Tidied: ${parts.join(", ")}.`,
        )
      })
      .catch(() => setTidyNote("Couldn't tidy right now."))
      .finally(() => {
        setTidying(false)
        setTidyProgress(null)
        reload()
      })
  }

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (!ready) return null
  if (quotes.length === 0) {
    return (
      <EmptyState
        title="No quotes yet"
        description="Highlight text on any page and use Save to FocusQuote to build your collection. Saved quotes are filed into Tags automatically."
      />
    )
  }

  const renderNode = (node: TagTreeNode, depth: number): preact.JSX.Element => {
    const isSel = selectionEq(selected, { kind: "tag", tagId: node.tag.id })
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(node.tag.id)
    const count = includeSubTags ? node.rollupCount : node.directCount
    return (
      <li key={node.tag.id}>
        <div
          class={cx(
            "group flex items-center gap-1 rounded-md py-1 pr-2 text-xs transition-colors",
            isSel ? "bg-surface-soft text-ink" : "text-mute hover:text-body",
          )}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleCollapsed(node.tag.id)}
              aria-label={isCollapsed ? "Expand" : "Collapse"}
              class="grid h-5 w-5 shrink-0 place-items-center rounded text-mute hover:text-ink"
            >
              {isCollapsed ? (
                <ChevronRight size={13} aria-hidden />
              ) : (
                <ChevronDown size={13} aria-hidden />
              )}
            </button>
          ) : (
            <span class="inline-block h-5 w-5 shrink-0" aria-hidden />
          )}
          <button
            type="button"
            onClick={() => setSelected({ kind: "tag", tagId: node.tag.id })}
            aria-pressed={isSel}
            class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span class="truncate font-medium">{node.tag.name}</span>
            {node.tag.userEdited && (
              <span
                class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                title="Pinned (your edit)"
                aria-hidden
              />
            )}
            <span class="ml-auto shrink-0 tabular-nums text-[11px] text-mute">
              {count}
            </span>
          </button>
          <button
            type="button"
            onClick={() => deleteTag(node.tag.id, node.tag.name)}
            aria-label={`Delete tag ${node.tag.name}`}
            class="shrink-0 rounded p-0.5 text-mute opacity-0 transition-opacity hover:text-accent-red focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 size={12} aria-hidden />
          </button>
        </div>
        {hasChildren && !isCollapsed && (
          <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    )
  }

  return (
    <div class="flex flex-col gap-3">
      {/* Toolbar: View toggle · Include sub-tags · Tidy now — one height/radius/
          border language; Tidy is the surface's single amber accent. */}
      <div class="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={view}
          onChange={setViewPersist}
          items={[
            {
              value: "list",
              ariaLabel: "List view",
              label: (
                <span class="inline-flex items-center gap-1.5">
                  <List size={13} aria-hidden /> List
                </span>
              ),
            },
            {
              value: "graph",
              ariaLabel: "Graph view",
              label: (
                <span class="inline-flex items-center gap-1.5">
                  <Network size={13} aria-hidden /> Graph
                </span>
              ),
            },
          ]}
        />
        <label class="inline-flex h-8 cursor-pointer items-center gap-2 rounded-control border border-rule-2 bg-paper-2 px-2.5 text-xs font-medium text-body">
          <Toggle
            size="sm"
            enabled={includeSubTags}
            onToggle={() => setIncludeSubTags((v) => !v)}
            ariaLabel="Include sub-tags"
          />
          Include sub-tags
        </label>
        <Button
          variant="primary"
          size="sm"
          type="button"
          // Useful when there's anything to do: loose quotes to file, or enough
          // tags to restructure.
          disabled={tidying || (graph.tags.length < 2 && untaggedIds.size === 0)}
          onClick={tidyNow}
          class="ml-auto !rounded-md gap-1.5"
        >
          <Sparkles size={13} aria-hidden />
          {tidying ? "Tidying…" : "Tidy now"}
        </Button>
      </div>
      {tidying ? (
        (() => {
          const { value, label } = tidyBar(tidyProgress)
          return (
            <div class="flex items-center gap-2">
              <Progress value={value} label={label} class="flex-1" />
              <span class="shrink-0 text-[11px] tabular-nums text-mute">
                {label}
              </span>
            </div>
          )
        })()
      ) : (
        tidyNote && <p class="text-[11px] text-mute">{tidyNote}</p>
      )}

      {view === "graph" ? (
        <QuotesGraph
          quotes={quotes}
          graph={graph}
          includeSubTags={includeSubTags}
          reheatSignal={reheatSignal}
          onShowInList={(tagId) => {
            setViewPersist("list")
            setSelected({ kind: "tag", tagId })
          }}
          onDeleteTag={(tagId, name) => deleteTag(tagId as TagId, name)}
        />
      ) : (
        <>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr]">
            {/* Tag tree */}
            <nav class="flex flex-col gap-0.5" aria-label="Tags">
              <button
                type="button"
                onClick={() => setSelected({ kind: "all" })}
                aria-pressed={selected.kind === "all"}
                class={cx(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  selected.kind === "all"
                    ? "bg-surface-soft text-ink"
                    : "text-mute hover:text-body",
                )}
              >
                <span class="flex-1 text-left">All quotes</span>
                <span class="tabular-nums text-[11px] text-mute">
                  {quotes.length}
                </span>
              </button>
              {tree.length > 0 && (
                <ul class="flex flex-col">{tree.map((n) => renderNode(n, 0))}</ul>
              )}
              {untaggedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected({ kind: "untagged" })}
                  aria-pressed={selected.kind === "untagged"}
                  class={cx(
                    "mt-0.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    selected.kind === "untagged"
                      ? "bg-surface-soft text-ink"
                      : "text-mute hover:text-body",
                  )}
                >
                  <span class="flex-1 text-left">{UNTAGGED_LABEL}</span>
                  <span class="tabular-nums text-[11px] text-mute">
                    {untaggedIds.size}
                  </span>
                </button>
              )}
            </nav>

            {/* Quote list */}
            {visible.length === 0 ? (
              <p class="px-1 py-6 text-center text-xs text-mute">
                No quotes under this tag.
              </p>
            ) : (
              <ul class="flex flex-col gap-2">
                {visible.map((q) => {
                  const qTags = tagsForQuote(graph, q.id)
                  const editing = taggingId === q.id
                  return (
                    <li
                      key={q.id}
                      class="group rounded-md border border-hairline bg-surface px-4 py-3"
                    >
                      <div class="flex items-start gap-2">
                        <blockquote class="flex-1 font-serif text-sm font-medium leading-snug text-ink">
                          {q.text}
                        </blockquote>
                        <button
                          type="button"
                          onClick={() => deleteQuote(q.id)}
                          aria-label="Delete quote"
                          class="shrink-0 rounded p-1 text-mute opacity-0 transition-opacity hover:text-accent-red focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </div>
                      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {(q.sourceTitle || q.sourceUrl) && (
                          <div class="flex items-center gap-1 text-[11px] text-mute">
                            {q.sourceUrl ? (
                              <a
                                href={q.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex items-center gap-0.5 font-medium text-link-blue hover:underline"
                              >
                                {q.sourceTitle ?? q.sourceUrl}
                                {/* <ExternalLink size={10} aria-hidden /> */}
                              </a>
                            ) : (
                              <span>{q.sourceTitle}</span>
                            )}
                          </div>
                        )}

                        <div class="ml-auto flex flex-wrap items-center gap-1.5">
                          {qTags.map((t) => (
                            <span
                              key={t.id}
                              class="inline-flex items-center gap-1 rounded-pill border border-hairline px-2 py-0.5 text-[11px] font-medium text-body"
                            >
                              {t.name}
                              <button
                                type="button"
                                onClick={() => detach(q.id, t.id)}
                                aria-label={`Remove tag ${t.name}`}
                                class="text-mute hover:text-ink"
                              >
                                <X size={11} aria-hidden />
                              </button>
                            </span>
                          ))}
                          {editing ? (
                            <input
                              type="text"
                              value={tagInput}
                              placeholder="Tag name"
                              autoFocus
                              onInput={(e) =>
                                setTagInput(
                                  (e.currentTarget as HTMLInputElement).value,
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitTag(q.id)
                                if (e.key === "Escape") setTaggingId(null)
                              }}
                              onBlur={() => commitTag(q.id)}
                              class="h-7 w-32 rounded-md border border-hairline-soft bg-canvas px-2 text-xs text-ink outline-none focus:ring-1 focus:ring-focus-ring/70"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => beginTagging(q.id)}
                              aria-label="Add tag"
                              class="inline-flex items-center gap-1 rounded-pill border border-dashed border-hairline px-2 py-0.5 text-[11px] font-medium text-mute transition-colors hover:border-hairline hover:text-body"
                            >
                              <Plus size={11} aria-hidden />
                              Tag
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
