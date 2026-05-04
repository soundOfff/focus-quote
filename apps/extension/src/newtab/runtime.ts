import { Effect, Layer, ManagedRuntime } from "effect"
import { StorageService } from "../services/storage"
import { SyncService } from "../services/sync"
import { QuotesService } from "../services/quotes"
import { ApiService } from "../services/api"
import { SessionsService } from "../services/sessions"
import { AuthService } from "../services/auth"

const Services = Layer.mergeAll(
  StorageService.Default,
  ApiService.Default,
  SyncService.Default,
  QuotesService.Default,
  SessionsService.Default,
  AuthService.Default,
)

export const runtime = ManagedRuntime.make(Services)

export const runP = <A, E>(
  eff: Effect.Effect<
    A,
    E,
    ManagedRuntime.ManagedRuntime.Context<typeof runtime>
  >,
) => runtime.runPromise(eff)
