import { sql } from "drizzle-orm"
import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core"

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

export const mediaBucketFiles = sqliteTable(
  "media_bucket_files",
  {
    id: text("id").primaryKey(),
    mimeType: text("mime_type").notNull(),
    dataBase64: text("data_base64").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    createdIdx: index("media_bucket_files_created_idx").on(t.createdAt),
  }),
)

export const userMediaRefs = sqliteTable(
  "user_media_refs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => mediaBucketFiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sessionId: text("session_id").references(() => focusSessions.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    userKindCreatedIdx: index("user_media_refs_user_kind_created_idx").on(
      t.userId,
      t.kind,
      t.createdAt,
    ),
    sessionCreatedIdx: index("user_media_refs_session_created_idx").on(
      t.sessionId,
      t.createdAt,
    ),
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

// ---------------- Remote-first user state ----------------
// All previously-local-only state in the extension is now mirrored here so
// that prefs, profile, privacy, secrets, AI chat history, recall attempts,
// and ephemeral toolbar state survive sign-in across devices.

// Per-user settings (1:1 with users). Mirrors `Prefs` + extras.
export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("dark"),
  defaultDurationMinutes: integer("default_duration_minutes")
    .notNull()
    .default(25),
  defaultBreakMinutes: integer("default_break_minutes").notNull().default(5),
  translateFromLang: text("translate_from_lang").notNull().default("auto"),
  translateToLang: text("translate_to_lang").notNull().default("en"),
  todayGoal: text("today_goal"),
  debugOverlayEnabled: integer("debug_overlay_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  notificationsBlocked: integer("notifications_blocked", { mode: "boolean" })
    .notNull()
    .default(false),
  toolbarSide: text("toolbar_side").notNull().default("right"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
})

// User-editable profile text (1:1 with users). Photo lives in user_media_refs.
export const userProfile = sqliteTable("user_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull().default(""),
  headline: text("headline").notNull().default(""),
  photoMediaFileId: text("photo_media_file_id"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
})

// URL tracking privacy preferences (1:1 with users). `blocklist` is a JSON
// array of hostnames stored as text.
export const userPrivacy = sqliteTable("user_privacy", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  trackUrls: integer("track_urls", { mode: "boolean" }).notNull().default(false),
  blocklist: text("blocklist").notNull().default("[]"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
})

// Encrypted client-provided secrets (e.g. OpenRouter key). Stored as
// base64(iv) || ":" || base64(ciphertext+tag) using AES-256-GCM at rest.
// The encryption key comes from the server's SECRETS_ENCRYPTION_KEY env.
export const userSecrets = sqliteTable(
  "user_secrets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    hint: text("hint"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    userKindIdx: index("user_secrets_user_kind_idx").on(t.userId, t.kind),
  }),
)

// AI toolbar chat history (Quote+AI and Guide Me). One thread per opened
// quote/guide session; messages are append-only.
export const aiChatThreads = sqliteTable(
  "ai_chat_threads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    passage: text("passage"),
    sourceUrl: text("source_url"),
    goal: text("goal"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    userKindUpdatedIdx: index("ai_chat_threads_user_kind_updated_idx").on(
      t.userId,
      t.kind,
      t.updatedAt,
    ),
  }),
)

export const aiChatMessages = sqliteTable(
  "ai_chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiChatThreads.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    threadCreatedIdx: index("ai_chat_messages_thread_created_idx").on(
      t.threadId,
      t.createdAt,
    ),
  }),
)

// User answers to recall questions. Persisted so we can show a study history.
export const recallAttempts = sqliteTable(
  "recall_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => focusSessions.id, { onDelete: "cascade" }),
    questionIndex: integer("question_index").notNull(),
    userAnswer: text("user_answer").notNull(),
    verdict: text("verdict").notNull(),
    feedback: text("feedback").notNull(),
    gradedAt: text("graded_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    sessionGradedIdx: index("recall_attempts_session_graded_idx").on(
      t.sessionId,
      t.gradedAt,
    ),
    userGradedIdx: index("recall_attempts_user_graded_idx").on(
      t.userId,
      t.gradedAt,
    ),
  }),
)

// Cross-device toolbar runtime state (zustand persist replacement). One row
// per (user, name) where `payload` is the serialized state blob.
export const toolbarRuntimeState = sqliteTable(
  "toolbar_runtime_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    payload: text("payload").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.name] }),
  }),
)
