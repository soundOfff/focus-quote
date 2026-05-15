import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"

// ---------------- Better Auth tables ----------------
// Mirrors the official Better Auth schema for SQLite.
// Reference: https://www.better-auth.com/docs/adapters/drizzle

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
})

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`,
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`,
  ),
})

// ---------------- App tables ----------------
// userId replaces the old per-device device_id partitioning.

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    tag: text("tag"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    userCreatedIdx: index("quotes_user_created_idx").on(
      t.userId,
      t.createdAt,
    ),
    userTagIdx: index("quotes_user_tag_idx").on(t.userId, t.tag),
  }),
)

export const focusSessions = sqliteTable(
  "focus_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goal: text("goal"),
    durationMinutes: integer("duration_minutes").notNull().default(25),
    breakMinutes: integer("break_minutes").notNull().default(5),
    completed: integer("completed", { mode: "boolean" })
      .notNull()
      .default(false),
    startedAt: text("started_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    endedAt: text("ended_at"),
    summary: text("summary"),
    // JSON blobs (string[] / Q&A[] / Resource[]) — see lib/study-artifacts.ts
    studyTips: text("study_tips"),
    recallQuestions: text("recall_questions"),
    resourceRecommendations: text("resource_recommendations"),
    topic: text("topic"),
  },
  (t) => ({
    userStartedIdx: index("focus_sessions_user_started_idx").on(
      t.userId,
      t.startedAt,
    ),
  }),
)

// URLs visited during a focus session. AI classifies each visit.
export const sessionUrls = sqliteTable(
  "session_urls",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => focusSessions.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    hostname: text("hostname").notNull(),
    title: text("title"),
    content: text("content"),
    visitedAt: text("visited_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    category: text("category"),
    distractionScore: integer("distraction_score"),
    summary: text("summary"),
  },
  (t) => ({
    sessionVisitedIdx: index("session_urls_session_visited_idx").on(
      t.sessionId,
      t.visitedAt,
    ),
    userVisitedIdx: index("session_urls_user_visited_idx").on(
      t.userId,
      t.visitedAt,
    ),
  }),
)

export const sessionActions = sqliteTable(
  "session_actions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => focusSessions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: text("payload").notNull(),
    at: text("at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    sessionAtIdx: index("session_actions_session_at_idx").on(t.sessionId, t.at),
  }),
)

// Hostname → category cache so repeat visits skip the LLM call.
export const urlClassifications = sqliteTable("url_classifications", {
  hostname: text("hostname").primaryKey(),
  category: text("category").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
})
