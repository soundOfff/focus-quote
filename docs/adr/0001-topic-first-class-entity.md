# Topic is a first-class entity, not a derived label

Topics began as an AI-generated text label stored on each focus session (`focusSessions.topic`), with screenshots keyed by that same string (`topic_media.topic`). We are promoting Topic to a first-class entity with a stable `TopicId`: focus sessions and all Vault items (text notes, saved URLs, screenshots) reference the `topicId`, and the AI-suggested name becomes a mutable attribute rather than the identity.

We made this change because Topics now own a user-curated Vault. Keying durable, hand-collected content to a mutable label — one the AI can re-derive per session — would silently orphan that content on any re-label or user rename, which is unacceptable once real effort is invested in a Vault.

## Considered options

- **Keep label-keyed, add note/URL tables like `topic_media`** — cheapest, but inherits the orphaning bug and isn't safe to rename offline.
- **Freeze the label once a Vault exists** — avoids a migration but adds surprising special-case logic (topics that stop auto-relabeling).

## Consequences

- A migration introduces a `topics` table and backfills one row per existing distinct `(userId, topic)` label, then repoints `focusSessions` and `topic_media` at `topicId`.
- New offline sync-queue job kinds are needed (`upsertTopic`, and Vault attach/detach jobs).
- A Topic's name is no longer its identity — UI and AI regeneration update the name attribute, never the key.
