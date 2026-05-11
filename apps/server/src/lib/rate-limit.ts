/**
 * In-memory token bucket keyed by userId. Used to cap LLM calls per session
 * per user. Buckets refill linearly toward `capacity` at `refillPerMin`.
 * Process-local — fine for single-instance dev/MVP; swap for Redis later.
 */

interface Bucket {
  tokens: number
  updatedAt: number
}

const buckets = new Map<string, Bucket>()

const CAPACITY = 30
const REFILL_PER_MIN = 30

const now = () => Date.now()

const refill = (b: Bucket) => {
  const elapsedMin = (now() - b.updatedAt) / 60_000
  b.tokens = Math.min(CAPACITY, b.tokens + elapsedMin * REFILL_PER_MIN)
  b.updatedAt = now()
}

export const tryConsume = (userId: string, cost = 1): boolean => {
  const existing = buckets.get(userId)
  const bucket: Bucket = existing ?? { tokens: CAPACITY, updatedAt: now() }
  refill(bucket)
  if (bucket.tokens < cost) {
    buckets.set(userId, bucket)
    return false
  }
  bucket.tokens -= cost
  buckets.set(userId, bucket)
  return true
}

export const remaining = (userId: string): number => {
  const b = buckets.get(userId)
  if (!b) return CAPACITY
  refill(b)
  return Math.floor(b.tokens)
}
