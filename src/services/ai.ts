import { Effect, Schedule, Schema } from "effect"
import { StorageService } from "./storage"
import { AIError } from "../shared/errors"
import { OPENROUTER_KEY_KEY } from "../shared/settings"

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
const DEFAULT_MODEL = "openai/gpt-4o-mini"

const ChatResponse = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      message: Schema.Struct({
        content: Schema.String,
      }),
    }),
  ),
})

export interface CompleteOptions {
  model?: string
  system?: string
  temperature?: number
  signal?: AbortSignal
}

const retryPolicy = Schedule.exponential("400 millis").pipe(
  Schedule.intersect(Schedule.recurs(2)),
)

export class AIService extends Effect.Service<AIService>()("AIService", {
  effect: Effect.gen(function* () {
    const storage = yield* StorageService

    const getKey: Effect.Effect<string, AIError> = Effect.gen(function* () {
      const key = yield* storage.get<string>(OPENROUTER_KEY_KEY).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
      )
      if (!key) {
        return yield* Effect.fail(
          new AIError({ message: "OpenRouter API key not set" }),
        )
      }
      return key
    })

    const complete = (
      prompt: string,
      opts: CompleteOptions = {},
    ): Effect.Effect<string, AIError> =>
      Effect.gen(function* () {
        const key = yield* getKey
        const messages = [
          ...(opts.system
            ? [{ role: "system" as const, content: opts.system }]
            : []),
          { role: "user" as const, content: prompt },
        ]
        const body = {
          model: opts.model ?? DEFAULT_MODEL,
          messages,
          temperature: opts.temperature ?? 0.7,
        }

        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(ENDPOINT, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
                "HTTP-Referer": "https://focusquote.local",
                "X-Title": "FocusQuote",
              },
              body: JSON.stringify(body),
              signal: opts.signal,
            }),
          catch: (cause) =>
            new AIError({ message: "OpenRouter request failed", cause }),
        })

        if (!res.ok) {
          const text = yield* Effect.promise(() => res.text())
          return yield* Effect.fail(
            new AIError({
              message: `OpenRouter ${res.status}: ${text.slice(0, 200)}`,
            }),
          )
        }

        const json = yield* Effect.tryPromise({
          try: () => res.json() as Promise<unknown>,
          catch: (cause) =>
            new AIError({ message: "OpenRouter returned non-JSON", cause }),
        })

        const parsed = yield* Schema.decodeUnknown(ChatResponse)(json).pipe(
          Effect.mapError(
            (e) =>
              new AIError({
                message: "OpenRouter response shape unexpected",
                cause: e,
              }),
          ),
        )

        const content = parsed.choices[0]?.message.content
        if (!content) {
          return yield* Effect.fail(
            new AIError({ message: "OpenRouter returned no content" }),
          )
        }
        return content
      }).pipe(Effect.retry(retryPolicy))

    const isConfigured: Effect.Effect<boolean, never> = storage
      .get<string>(OPENROUTER_KEY_KEY)
      .pipe(
        Effect.map((v) => !!v && v.length > 0),
        Effect.catchAll(() => Effect.succeed(false)),
      )

    return { complete, isConfigured }
  }),
  dependencies: [StorageService.Default],
}) {}
