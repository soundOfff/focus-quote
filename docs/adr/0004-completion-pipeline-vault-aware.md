# Session completion is a two-phase pipeline that feeds the Topic's Vault into resource recommendations and recall

Completion artifacts were generated concurrently with topic resolution and from tracked visits alone, so the user's curated Vault — their most deliberate signal — never reached the AI, and the prompts often ran on empty input (visit capture is off and opt-in). We are restructuring session completion into a **two-phase pipeline**: **Phase 1 (parallel)** generates the Vault-independent artifacts (Summary, Study tips); **Phase 2 (sequential)** resolves the Topic, flushes the Vault, then generates **Resource recommendations** and **Recall questions** with the Topic's Vault as context. The Vault is treated as the user's *already-known set*: resource recommendations exclude what's already saved/seen and seed novelty from it; recall draws on the user's own notes and screenshots.

## Key decisions

- **The Phase 2 ordering is deliberate — do not re-parallelize.** The vault-aware artifacts MUST run *after* topic-resolve + flush so they see a resolved Topic and a promoted Vault. Generation is background/fire-and-forget, so the added latency is invisible; correctness of the known-set on first view is what matters.
- **Exclusion is two layers, never collapsed.** Layer A (hard, deterministic, in code) drops URLs already in the Topic's Vault ∪ this session's tracked visits. Layer B (semantic, in the prompt) biases toward novelty. The LLM is never trusted for the hard dedup.
- **Scope split by Topic coarseness.** Topics are 12 fixed categories, so *exclude at Topic scope* (broad is fine for dedup) but *seed at session scope* (a whole category is too broad to seed from).
- **Vault-first, tracked-visits-optional.** Features must produce good output from Goal + Topic + Vault items + notes + screenshots alone; tracked visits are a privacy-gated bonus, never a dependency. Re-enabling visit capture is a separate decision, out of scope here.
- **One shared `runCompletionDownstream`.** The two diverged completion blocks are unified; the unreachable `POST /api/focus-sessions` downstream copy is deleted. The AI **never authors a Goal** (`maybeAutoDeriveGoal` dropped) — Title is the only AI label, per the glossary.
- **Quotes stay independent of Sessions/Topics** ([ADR 0001](./0001-topic-first-class-entity.md), [ADR 0003](./0003-quote-tag-graph.md) upheld). The Vault — not the Quote — is the session/topic-scoped "saved material." Topic context may feed the Quote tag classifier as a one-directional hint, but no Quote↔Topic foreign key is introduced.

## Consequences

- Topic resolution and `flushPendingSessionVault` move onto the critical path before generation, so their latent bugs become load-bearing and are fixed as part of this work: `promoteSessionVaultItems` upserts `topicId` on conflict (so a later manual topic-assign *moves* items instead of dropping them), `ensureTopicId` gains an `onConflict` upsert, and `maybeGenerateTopic` gates on `topicId` rather than the legacy `topic` string.
- The prompt builders gain a Vault block and drop the perpetually-null `category` field.
- Finishing takes a few seconds longer to fully settle, so `SessionDetail` shows a "generating" state and the finish toast offers a "View report" action.
- A distinct **Finish (complete)** popup action is added so a user who ends early reaches the pipeline at all; **Stop** remains a cancel.
