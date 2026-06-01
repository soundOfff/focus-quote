# Job Application data (CV, Answer Bank) stored locally only, not synced

The Job Application feature requires storing sensitive personal data: the user's CV (plain text) and their Answer Bank (pre-answered questions with responses). Unlike Quotes, Sessions, and Topics which sync to the server, the Application Profile (CV + Answer Bank) lives exclusively in `chrome.storage.local` and never leaves the device. The server acts as a passthrough for AI generation — receiving CV and answers in the request, generating a response, and immediately discarding the data without persistence.

We made this choice to prioritize user privacy and reduce liability in v1. A CV contains highly sensitive information (full employment history, contact details, skills), and Answer Bank responses are deeply personal. Storing this data server-side introduces GDPR compliance burden, encryption requirements, and user trust concerns that are premature for an MVP. Local-only storage lets users try the feature without worrying about where their resume lives, and we avoid building secure vault infrastructure before validating product-market fit.

## Considered options

- **Sync to server like other features** — enables cross-device use and richer AI context (server can cache company research per user, build better answers over time), but requires encryption at rest, GDPR-compliant deletion flows, explicit consent UI, and increases user trust barrier for a new feature.
- **Hybrid (CV local, answers synced)** — answers are less sensitive than CV, but splitting the model complicates UX ("why does my CV disappear but answers don't?") and still requires server-side data handling for answers.
- **User-provided API key (no server at all)** — maximum privacy but terrible UX (users must sign up for Anthropic, add payment, copy key) and prevents server-side company research.

## Consequences

- Application Profile setup is per-device — reinstalling the extension or switching computers loses the data (users must re-enter CV and answers). We can add export/import later if needed.
- The server cannot optimize AI generation using historical context (e.g., "this user usually emphasizes X") because it sees each request in isolation.
- Company Context (research about companies) can be cached locally, but not shared across users (if 100 users apply to Google, each extension re-researches Google independently).
- If we later want to add sync, we need a migration path: prompt users to opt-in, encrypt data in transit and at rest, build key management, handle GDPR right-to-deletion.
- The server's `/api/jobs/generate-answer` endpoint must have a strict no-logging policy for request bodies and be documented as stateless.
