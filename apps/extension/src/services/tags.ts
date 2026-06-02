import { Effect, Schema } from "effect"
import { StorageService } from "./storage"
import { ApiService } from "./api"
import { SyncService } from "./sync"
import {
  TagGraph,
  type Tag,
  type TagId,
  type QuoteId,
  type ConsolidateProgressEvent,
} from "@focus-quote/shared"
import { findTagByName } from "../shared/tag-graph"

const GRAPH_KEY = "focusquote.tagGraph"

const EMPTY: TagGraph = { tags: [], edges: [], memberships: [] }

/**
 * TagsService owns the extension's synced read-model of the AI-maintained Tag
 * graph (ADR 0003) so the tree browser renders offline. Capture stays
 * offline-first: manual tagging mutates the local read-model instantly and
 * enqueues sync jobs; the server's autonomous categorizer fills in the rest and
 * `pullGraph` refreshes the read-model on each sync tick.
 */
export class TagsService extends Effect.Service<TagsService>()("TagsService", {
  effect: Effect.gen(function* () {
    const storage = yield* StorageService
    const api = yield* ApiService
    const sync = yield* SyncService

    const readGraph = Effect.gen(function* () {
      const raw = yield* storage
        .get<unknown>(GRAPH_KEY)
        .pipe(Effect.catchAll(() => Effect.succeed(null)))
      if (raw === null) return EMPTY
      return yield* Schema.decodeUnknown(TagGraph)(raw).pipe(
        Effect.catchAll(() => Effect.succeed(EMPTY)),
      )
    })

    const writeGraph = (g: TagGraph) =>
      storage.set(GRAPH_KEY, g).pipe(Effect.catchAll(() => Effect.void))

    /** Read the local read-model (never fails — empty graph on any error). */
    const getGraph = readGraph

    /**
     * Fetch the authoritative graph from the server and cache it locally.
     * Offline / signed out → keep (and return) the current local read-model.
     */
    const pullGraph = Effect.gen(function* () {
      const resp = yield* api.getTagGraph().pipe(Effect.either)
      if (resp._tag === "Left") return yield* readGraph
      const decoded = yield* Schema.decodeUnknown(TagGraph)(resp.right).pipe(
        Effect.catchAll(() => readGraph),
      )
      yield* writeGraph(decoded)
      return decoded
    })

    /**
     * Manually file a quote under a Tag name. Resolves to an existing Tag
     * (case-insensitive) or creates one; pins both the Tag and the membership
     * (userEdited) so the AI never overrides them; skips the AI entirely.
     */
    const manualTag = (quoteId: QuoteId, rawName: string) =>
      Effect.gen(function* () {
        const name = rawName.trim().slice(0, 60)
        if (!name) return null
        const graph = yield* readGraph
        const now = new Date().toISOString()
        const existing = findTagByName(graph, name)
        let tagId: TagId
        let tags = graph.tags
        let enqueueUpsert = false
        if (existing) {
          tagId = existing.id
        } else {
          tagId = crypto.randomUUID() as TagId
          const tag: Tag = {
            id: tagId,
            name,
            userEdited: true,
            createdAt: now,
            updatedAt: now,
          }
          tags = [...graph.tags, tag]
          enqueueUpsert = true
        }
        const alreadyAttached = graph.memberships.some(
          (m) => m.quoteId === quoteId && m.tagId === tagId,
        )
        const memberships = alreadyAttached
          ? graph.memberships
          : [...graph.memberships, { quoteId, tagId, userEdited: true }]
        yield* writeGraph({ ...graph, tags, memberships })
        if (enqueueUpsert) {
          yield* sync.enqueue({
            kind: "upsertTag",
            id: tagId,
            name,
            createdAt: now,
            updatedAt: now,
          })
        }
        if (!alreadyAttached) {
          yield* sync.enqueue({
            kind: "attachQuoteTag",
            quoteId,
            tagId,
            createdAt: now,
          })
        }
        return tagId
      })

    /** Remove a quote's membership in a Tag (manual detach). */
    const detach = (quoteId: QuoteId, tagId: TagId) =>
      Effect.gen(function* () {
        const graph = yield* readGraph
        const memberships = graph.memberships.filter(
          (m) => !(m.quoteId === quoteId && m.tagId === tagId),
        )
        yield* writeGraph({ ...graph, memberships })
        yield* sync.enqueue({ kind: "detachQuoteTag", quoteId, tagId })
      })

    /** Rename a Tag (pins it). */
    const renameTag = (tagId: TagId, rawName: string) =>
      Effect.gen(function* () {
        const name = rawName.trim().slice(0, 60)
        if (!name) return
        const graph = yield* readGraph
        const now = new Date().toISOString()
        const current = graph.tags.find((t) => t.id === tagId)
        const tags = graph.tags.map((t) =>
          t.id === tagId
            ? { ...t, name, userEdited: true, updatedAt: now }
            : t,
        )
        yield* writeGraph({ ...graph, tags })
        yield* sync.enqueue({
          kind: "upsertTag",
          id: tagId,
          name,
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
        })
      })

    /** Delete a Tag and everything hanging off it locally; sync the delete. */
    const deleteTag = (tagId: TagId) =>
      Effect.gen(function* () {
        const graph = yield* readGraph
        yield* writeGraph({
          tags: graph.tags.filter((t) => t.id !== tagId),
          edges: graph.edges.filter(
            (e) => e.parentId !== tagId && e.childId !== tagId,
          ),
          memberships: graph.memberships.filter((m) => m.tagId !== tagId),
        })
        yield* sync.enqueue({ kind: "deleteTag", id: tagId })
      })

    /**
     * Run the server-side Consolidation ("Tidy now") pass, streaming progress
     * frames to `onProgress` so the caller can fill a determinate bar, then pull
     * the freshly-reshaped graph.
     */
    const consolidate = (
      onProgress: (event: ConsolidateProgressEvent) => void,
    ) =>
      Effect.gen(function* () {
        const changes = yield* api.consolidateTagsStream(onProgress)
        const graph = yield* pullGraph
        return { changes, graph }
      })

    return {
      getGraph,
      pullGraph,
      manualTag,
      detach,
      renameTag,
      deleteTag,
      consolidate,
    }
  }),
  dependencies: [
    StorageService.Default,
    ApiService.Default,
    SyncService.Default,
  ],
}) {}
