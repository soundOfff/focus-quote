# Quotes are filed in an AI-maintained Tag graph, not a flat folder

Quotes were grouped by a single `tag` string per Quote — a flat, single-membership Folder derived in memory. We are replacing that with **Tags**: subjects that form a directed acyclic graph (a Tag may have several parent Tags; a Quote may carry several Tags), maintained by the AI. The flat Folder concept is removed entirely; because the feature has only ever been used by its author, the old tag data is discarded rather than migrated.

We chose this because the goal is to auto-organize every captured Quote into a navigable knowledge structure, not just a one-word bucket. A graph (rather than a tree) lets a Quote sit under multiple subjects and a subject hang under multiple parents, which matches how research notes actually cluster. Tags carry a stable identity independent of their name (same reasoning as [ADR 0001](./0001-topic-first-class-entity.md) for Topic), so the AI can rename, merge, and re-parent without orphaning Quotes.

## Considered options

- **Keep the flat single-`tag` Folder** — simplest, but can't express hierarchy or multi-membership; rejected as the whole point of the feature.
- **A strict tree, one Tag per Quote** — cheaper data model (single parent pointer, single membership), but can't file one Quote under several subjects; rejected for being too rigid.
- **Unify with Topic** — make Topic hierarchical and hang Quotes off Topic nodes. Conceptually tidy ("research subjects"), but it would couple user-global Quotes to the session/Vault lifecycle. Rejected to keep the two taxonomies independent.

## Key decisions

- **Server owns the graph.** The Anthropic key is server-side and the curator needs the whole graph in context, so the graph lives on the server (new `tags`, `tag_edges`, `quote_tags` tables, each with a `userEdited`/pinned flag). The extension holds a synced read-model so the tree renders offline. Graph mutations are serialized per user; re-parenting is cycle-checked.
- **Capture stays offline-first.** Save writes locally instantly and marks the Quote "pending"; categorization runs server-side when online and syncs back. Capture never blocks and never requires network. Manual tagging resolves names to existing Tags or creates them, pins the membership, and skips the AI.
- **Curation is split by frequency, and uses Haiku.** Every Save runs a cheap Haiku pass that only attaches the Quote and creates a Tag if nothing fits — work Haiku does reliably. The error-prone restructuring (merge / rename / re-parent / split) runs only on a manual **Consolidation** ("Tidy now"), which re-files only the Quotes those changes touch. This keeps Save fast and cheap and concentrates Haiku's weak spot (autonomous restructuring) into a deliberate, inspectable action.
- **Autonomous, but user edits are pinned.** The curator restructures without an approval step, but never overrides a Tag or membership the user created or edited.
- **No hard size limit.** The graph grows organically; to fight sprawl and near-duplicate Tags, the classifier always receives the current graph so it reuses Tags rather than reinventing them.

## Consequences

- New offline sync-job kinds (`upsertTag`, `deleteTag`, attach/detach, manual-tag); a "pending" Quote state; a `consolidate` endpoint.
- The flat-folder code (`quote-folders.ts`, folder chips) is replaced by a DAG tree browser with roll-up (an *include sub-tags* toggle).
- The per-Save Haiku call is default-ON and bursty, so it must be rate-limited/debounced (per CLAUDE.md's AI-call guidance).
- Haiku's restructuring quality is a known risk; if Consolidation proves sloppy, escalating only that pass to Sonnet is the intended lever.
