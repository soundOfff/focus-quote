import { describe, it, expect, beforeEach, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { db } from "../src/db/client"
import { focusSessions } from "../src/db/schema"
import { createTestUser } from "./helpers"

// Drain all currently-queued microtasks (a macrotask tick settles them all),
// so assertions see the pipeline's true state once it has parked on a gate.
const tick = () => new Promise((r) => setTimeout(r, 0))

// A controllable deferred so the test can hold Phase 2 mid-flight and assert
// that the Vault-aware generators have not fired yet.
function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// Shared call-order log + controllable gates, defined via vi.hoisted so the
// vi.mock factories (which are hoisted above imports) can close over them.
const h = vi.hoisted(() => {
  return {
    calls: [] as string[],
    topicGate: { promise: Promise.resolve(), resolve: () => {} },
    flushGate: { promise: Promise.resolve(), resolve: () => {} },
  }
})

vi.mock("../src/lib/summary", () => ({
  maybeGenerateSummary: vi.fn(async () => {
    h.calls.push("summary")
  }),
}))

vi.mock("../src/lib/study-artifacts", () => ({
  maybeGenerateStudyTips: vi.fn(async () => {
    h.calls.push("studyTips")
  }),
  maybeGenerateRecallQuestions: vi.fn(async () => {
    h.calls.push("recall")
  }),
  maybeGenerateResourceRecommendations: vi.fn(async () => {
    h.calls.push("resources")
  }),
}))

vi.mock("../src/lib/topic", () => ({
  maybeAutoDeriveGoal: vi.fn(async () => {
    h.calls.push("autoDeriveGoal")
  }),
  maybeGenerateTitle: vi.fn(async () => {
    h.calls.push("title")
  }),
  maybeGenerateTopic: vi.fn(async () => {
    h.calls.push("topic:start")
    await h.topicGate.promise
    h.calls.push("topic:done")
  }),
}))

vi.mock("../src/lib/vault", () => ({
  flushPendingSessionVault: vi.fn(async () => {
    h.calls.push("flush:start")
    await h.flushGate.promise
    h.calls.push("flush:done")
  }),
}))

vi.mock("../src/lib/ai-gate", () => ({
  aiFeatureEnabledForUser: vi.fn(async () => false),
}))

import { runCompletionDownstream } from "../src/lib/completion"

async function seedCompletedSession(userId: string, goal: string | null) {
  const id = randomUUID()
  const now = new Date().toISOString()
  await db.insert(focusSessions).values({
    id,
    userId,
    goal,
    durationMinutes: 25,
    breakMinutes: 5,
    completed: true,
    startedAt: now,
    endedAt: now,
  })
  return id
}

describe("runCompletionDownstream (two-phase pipeline, ADR-0004)", () => {
  beforeEach(() => {
    h.calls.length = 0
    h.topicGate = deferred()
    h.flushGate = deferred()
  })

  it("starts Summary and Study tips immediately, before Topic resolves", async () => {
    const { userId } = await createTestUser()
    const sessionId = await seedCompletedSession(userId, "ship MVP")

    const run = runCompletionDownstream(userId, sessionId)
    // Let the synchronous kick-offs and first microtasks settle. Topic is still
    // gated (Phase 2 is parked), so generation is mid-flight.
    await tick()

    expect(h.calls).toContain("summary")
    expect(h.calls).toContain("studyTips")

    // Unblock Phase 2 so the run can finish and we don't leak a pending promise.
    h.topicGate.resolve()
    h.flushGate.resolve()
    await run
  })

  it("defers Resource recommendations and Recall until Topic + Vault flush complete", async () => {
    const { userId } = await createTestUser()
    const sessionId = await seedCompletedSession(userId, "ship MVP")

    const run = runCompletionDownstream(userId, sessionId)

    // Topic resolution is still in flight: vault-aware artifacts must not fire.
    await tick()
    expect(h.calls).not.toContain("recall")
    expect(h.calls).not.toContain("resources")

    // Topic resolves, but the Vault has not been flushed yet — still must wait.
    h.topicGate.resolve()
    await tick()
    expect(h.calls).toContain("topic:done")
    expect(h.calls).toContain("flush:start")
    expect(h.calls).not.toContain("recall")
    expect(h.calls).not.toContain("resources")

    // Vault flush completes — only now may the vault-aware artifacts read.
    h.flushGate.resolve()
    await run

    expect(h.calls).toContain("recall")
    expect(h.calls).toContain("resources")

    // Ordering invariant: flush:done strictly precedes both vault-aware reads.
    const flushDone = h.calls.indexOf("flush:done")
    expect(flushDone).toBeGreaterThanOrEqual(0)
    expect(h.calls.indexOf("recall")).toBeGreaterThan(flushDone)
    expect(h.calls.indexOf("resources")).toBeGreaterThan(flushDone)
  })
})
