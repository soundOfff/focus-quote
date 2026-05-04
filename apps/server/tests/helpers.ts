import { randomUUID } from "node:crypto"
import { db } from "../src/db/client"
import { users, sessions } from "../src/db/schema"
import { app } from "../src/app"

export interface TestUser {
  userId: string
  email: string
  token: string
}

/**
 * Seeds a user + a fresh session token directly into the DB.
 * The token works as a Bearer auth credential because Better Auth's
 * bearer plugin reads `Authorization: Bearer <session.token>` and
 * resolves it against the sessions table.
 */
export async function createTestUser(
  email = `test-${randomUUID()}@example.com`,
): Promise<TestUser> {
  const userId = randomUUID()
  const sessionId = randomUUID()
  const token = randomUUID()

  await db.insert(users).values({
    id: userId,
    email,
    name: "Test User",
    emailVerified: true,
    image: null,
  })

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    token,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    ipAddress: null,
    userAgent: null,
  })

  return { userId, email, token }
}

export const authedFetch = (token: string) =>
  (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    })

export const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})
