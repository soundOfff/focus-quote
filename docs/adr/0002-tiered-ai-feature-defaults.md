# Tiered defaults for token-spending AI features

Every AI feature spends tokens (the server's Anthropic key or the user's OpenRouter key), and CLAUDE.md states "AI features are opt-in." Read literally, that would leave even distraction detection — the product's core value — switched off until the user configures it. We instead adopt **tiered defaults behind a single global AI master switch**:

1. **Core distraction detection** defaults **ON** — the app must actually detect distractions to be worth installing.
2. **On-demand artifacts** (session summary, study tips, recall questions, resource recommendations, Quote+AI, Guide Me) never run unprompted — they fire only when invoked or regenerated.
3. **Automatic generators** (auto-Title, auto-generated recall questions) default **OFF** and are individually opt-in.

Every token-spending feature also has its own toggle; the master switch disables all of them at once.

This balances out-of-box value against cost/privacy control while honoring the spirit of "opt-in" for anything that would spend tokens *without the user asking*.

## Consequences

- New per-feature toggles plus a master switch are added to user settings.
- "AI features are opt-in" in CLAUDE.md should be read as this tiered policy, not blanket-off.
