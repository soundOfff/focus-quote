import { Data } from "effect"

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly message: string
  readonly status?: number
  readonly cause?: unknown
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class SyncError extends Data.TaggedError("SyncError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class AIError extends Data.TaggedError("AIError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly resource: string
  readonly id: string
}> {}

export class SignedOutError extends Data.TaggedError("SignedOutError")<{
  readonly message: string
}> {}

export class AuthError extends Data.TaggedError("AuthError")<{
  readonly message: string
  readonly cause?: unknown
}> {}
