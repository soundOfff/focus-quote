import { describe, it, expect } from "vitest"
import { eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { db } from "../src/db/client"
import {
  focusSessions,
  mediaBucketFiles,
  topicMedia,
  topics,
} from "../src/db/schema"
import { backfillTopics } from "../src/lib/topic"
import { authedFetch, createTestUser, json } from "./helpers"

const insertSession = async (userId: string, topic: string | null) => {
  const id = randomUUID()
  await db.insert(focusSessions).values({ id, userId, topic })
  return id
}

const insertMedia = async (userId: string, topic: string) => {
  const fileId = randomUUID()
  await db
    .insert(mediaBucketFiles)
    .values({ id: fileId, mimeType: "image/png", dataBase64: "x", byteSize: 1 })
  const id = randomUUID()
  await db.insert(topicMedia).values({ id, userId, topic, fileId })
  return id
}

describe("backfillTopics (M1)", () => {
  it("creates one Topic per distinct (user, label) and links its sessions", async () => {
    const { userId } = await createTestUser()
    const s1 = await insertSession(userId, "React Hooks")
    const s2 = await insertSession(userId, "React Hooks")
    const s3 = await insertSession(userId, "Effect")
    const sNull = await insertSession(userId, null)

    const res = await backfillTopics()
    expect(res.topicsCreated).toBe(2)
    expect(res.sessionsLinked).toBe(3)

    const all = await db.select().from(topics).where(eq(topics.userId, userId))
    expect(all).toHaveLength(2)
    expect(new Set(all.map((t) => t.name))).toEqual(
      new Set(["React Hooks", "Effect"]),
    )

    const linked = await db
      .select({ id: focusSessions.id, topicId: focusSessions.topicId })
      .from(focusSessions)
      .where(eq(focusSessions.userId, userId))
    const byId = new Map(linked.map((r) => [r.id, r.topicId]))
    expect(byId.get(s1)).toBeTruthy()
    expect(byId.get(s1)).toBe(byId.get(s2)) // same label -> same topic
    expect(byId.get(s3)).not.toBe(byId.get(s1))
    expect(byId.get(sNull)).toBeNull() // null label stays unlinked
  })

  it("links topic media and leaves no orphan label", async () => {
    const { userId } = await createTestUser()
    await insertSession(userId, "Rust")
    await insertMedia(userId, "Rust")
    const orphan = await insertMedia(userId, "Orphan Label") // no session

    await backfillTopics()

    const media = await db
      .select({ id: topicMedia.id, topicId: topicMedia.topicId })
      .from(topicMedia)
      .where(eq(topicMedia.userId, userId))
    expect(media.every((m) => m.topicId !== null)).toBe(true)

    const orphanRow = media.find((m) => m.id === orphan)!
    const [orphanTopic] = await db
      .select({ name: topics.name })
      .from(topics)
      .where(eq(topics.id, orphanRow.topicId!))
    expect(orphanTopic?.name).toBe("Orphan Label")
  })

  it("is idempotent — a second run links nothing new", async () => {
    const { userId } = await createTestUser()
    await insertSession(userId, "Idempotent")
    const first = await backfillTopics()
    expect(first.topicsCreated).toBe(1)
    const second = await backfillTopics()
    expect(second).toEqual({
      topicsCreated: 0,
      sessionsLinked: 0,
      mediaLinked: 0,
    })
  })

  it("isolates topics by user (same label -> distinct topics)", async () => {
    const a = await createTestUser("a-topics@example.com")
    const b = await createTestUser("b-topics@example.com")
    await insertSession(a.userId, "Shared")
    await insertSession(b.userId, "Shared")
    await backfillTopics()
    const aTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.userId, a.userId))
    const bTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.userId, b.userId))
    expect(aTopics).toHaveLength(1)
    expect(bTopics).toHaveLength(1)
    expect(aTopics[0]!.id).not.toBe(bTopics[0]!.id)
  })
})

describe("PATCH /api/topics/:id (rename)", () => {
  it("renames a topic and cascades the label onto sessions + media", async () => {
    const { userId, token } = await createTestUser()
    await insertSession(userId, "Old Name")
    await insertMedia(userId, "Old Name")
    await backfillTopics()
    const [topic] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.userId, userId))

    const res = await authedFetch(token)(`/api/topics/${topic!.id}`, {
      ...json({ name: "New Name" }),
      method: "PATCH",
    })
    expect(res.status).toBe(200)

    const [renamed] = await db
      .select({ name: topics.name })
      .from(topics)
      .where(eq(topics.id, topic!.id))
    expect(renamed!.name).toBe("New Name")

    const [session] = await db
      .select({ topic: focusSessions.topic })
      .from(focusSessions)
      .where(eq(focusSessions.userId, userId))
    expect(session!.topic).toBe("New Name") // label cascaded

    const [media] = await db
      .select({ topic: topicMedia.topic })
      .from(topicMedia)
      .where(eq(topicMedia.userId, userId))
    expect(media!.topic).toBe("New Name") // media still attached
  })

  it("rejects a rename that collides with another topic (409)", async () => {
    const { userId, token } = await createTestUser()
    await insertSession(userId, "Alpha")
    await insertSession(userId, "Beta")
    await backfillTopics()
    const [alpha] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.name, "Alpha"))

    const res = await authedFetch(token)(`/api/topics/${alpha!.id}`, {
      ...json({ name: "Beta" }),
      method: "PATCH",
    })
    expect(res.status).toBe(409)
  })
})
