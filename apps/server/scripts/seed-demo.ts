import { createHash, randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import { and, eq, isNull } from "drizzle-orm"
import { migrate } from "drizzle-orm/libsql/migrator"
import { env } from "../src/env"
import { db, libsql } from "../src/db/client"
import {
  focusSessions,
  quoteTags,
  quotes,
  sessionUrls,
  sessions,
  users,
} from "../src/db/schema"
import { runCompletionDownstream } from "../src/lib/completion"
import { DEMO_REPORT_GOAL, DEMO_SESSIONS } from "../src/lib/demo-fixtures"
import { forceRegenerate } from "../src/lib/study-artifacts"
import { maybeGenerateSummary } from "../src/lib/summary"
import { consolidateGraph } from "../src/lib/tags"
import { ensureTopicId } from "../src/lib/topic"

// Usage: DEMO_FIXTURES=1 DATABASE_URL=file:<scratch>.db BETTER_AUTH_SECRET=<any> \
//   tsx scripts/seed-demo.ts <storage-out.json>
// Builds the portfolio demo account on a scratch database and writes the
// extension's chrome.storage.local seed (token, user, local session list).

const storageOut = process.argv[2]
if (!env.DEMO_FIXTURES || !storageOut) {
  console.error("seed-demo: run with DEMO_FIXTURES=1 and an output path for the storage seed")
  process.exit(1)
}

const DEMO_USER = { name: "Ada Lovelace", email: "ada@example.com" }

const QUOTES: ReadonlyArray<{ text: string; author: string; work: string; slug: string }> = [
  { text: "The Analytical Engine weaves algebraical patterns just as the Jacquard loom weaves flowers and leaves.", author: "Ada Lovelace", work: "Notes on the Analytical Engine", slug: "Ada_Lovelace" },
  { text: "The Analytical Engine has no pretensions whatever to originate anything. It can do whatever we know how to order it to perform.", author: "Ada Lovelace", work: "Note G", slug: "Note_G" },
  { text: "On two occasions I have been asked, 'Pray, Mr. Babbage, if you put into the machine wrong figures, will the right answers come out?'", author: "Charles Babbage", work: "Passages from the Life of a Philosopher", slug: "Charles_Babbage" },
  { text: "Errors using inadequate data are much less than those using no data at all.", author: "Charles Babbage", work: "Attributed", slug: "Charles_Babbage" },
  { text: "The art of remembering is the art of thinking.", author: "William James", work: "Talks to Teachers on Psychology", slug: "William_James" },
  { text: "Memory is the treasury and guardian of all things.", author: "Cicero", work: "De Oratore", slug: "De_Oratore" },
  { text: "The true art of memory is the art of attention.", author: "Samuel Johnson", work: "The Idler", slug: "The_Idler_(1758%E2%80%931760)" },
  { text: "Study without desire spoils the memory, and it retains nothing that it takes in.", author: "Leonardo da Vinci", work: "Notebooks", slug: "Leonardo_da_Vinci" },
  { text: "My experience is what I agree to attend to.", author: "William James", work: "The Principles of Psychology", slug: "The_Principles_of_Psychology" },
  { text: "Everyone knows what attention is. It is the taking possession by the mind, in clear and vivid form, of one out of what seem several simultaneously possible objects or trains of thought.", author: "William James", work: "The Principles of Psychology", slug: "The_Principles_of_Psychology" },
  { text: "To do two things at once is to do neither.", author: "Publilius Syrus", work: "Sententiae", slug: "Publilius_Syrus" },
  { text: "Habit is thus the enormous fly-wheel of society, its most precious conservative agent.", author: "William James", work: "The Principles of Psychology", slug: "The_Principles_of_Psychology" },
  { text: "The chains of habit are too weak to be felt until they are too strong to be broken.", author: "Samuel Johnson", work: "Attributed", slug: "Samuel_Johnson" },
  { text: "Habit is a second nature.", author: "Cicero", work: "De Finibus", slug: "De_finibus_bonorum_et_malorum" },
  { text: "Curiosity is one of the permanent and certain characteristics of a vigorous intellect.", author: "Samuel Johnson", work: "The Rambler", slug: "The_Rambler" },
  { text: "Wonder is the feeling of a philosopher, and philosophy begins in wonder.", author: "Plato", work: "Theaetetus", slug: "Theaetetus_(dialogue)" },
  { text: "Reading maketh a full man; conference a ready man; and writing an exact man.", author: "Francis Bacon", work: "Of Studies", slug: "Francis_Bacon" },
  { text: "Some books are to be tasted, others to be swallowed, and some few to be chewed and digested.", author: "Francis Bacon", work: "Of Studies", slug: "Francis_Bacon" },
  { text: "The mind is not a vessel to be filled, but a fire to be kindled.", author: "Plutarch", work: "On Listening to Lectures", slug: "Plutarch" },
  { text: "Learning without thought is labor lost; thought without learning is perilous.", author: "Confucius", work: "Analects", slug: "Analects" },
  { text: "The difference between the almost right word and the right word is really a large matter. It's the difference between the lightning-bug and the lightning.", author: "Mark Twain", work: "Letter to George Bainton", slug: "Mark_Twain" },
  { text: "Brevity is the soul of wit.", author: "William Shakespeare", work: "Hamlet", slug: "Hamlet" },
  { text: "I have made this letter longer than usual, only because I have not had the time to make it shorter.", author: "Blaise Pascal", work: "Provincial Letters", slug: "Lettres_provinciales" },
  { text: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca", work: "On the Shortness of Life", slug: "De_Brevitate_Vitae_(Seneca)" },
  { text: "Lost time is never found again.", author: "Benjamin Franklin", work: "Poor Richard's Almanack", slug: "Poor_Richard%27s_Almanack" },
  { text: "Dost thou love life? Then do not squander time, for that's the stuff life is made of.", author: "Benjamin Franklin", work: "Poor Richard's Almanack", slug: "Poor_Richard%27s_Almanack" },
  { text: "Since it is possible that thou mayest depart from life this very moment, regulate every act and thought accordingly.", author: "Marcus Aurelius", work: "Meditations", slug: "Meditations" },
  { text: "Ignorance more frequently begets confidence than does knowledge.", author: "Charles Darwin", work: "The Descent of Man", slug: "The_Descent_of_Man,_and_Selection_in_Relation_to_Sex" },
  { text: "If I have seen further it is by standing on the shoulders of Giants.", author: "Isaac Newton", work: "Letter to Robert Hooke", slug: "Standing_on_the_shoulders_of_giants" },
  { text: "Truth is ever to be found in simplicity, and not in the multiplicity and confusion of things.", author: "Isaac Newton", work: "Attributed", slug: "Isaac_Newton" },
]

const HOUR = 60 * 60 * 1000
const now = Date.now()

const startOf = (daysAgo: number, startHour: number, durationMinutes: number): Date => {
  if (daysAgo === 0) return new Date(now - (durationMinutes * 60 * 1000 + 2 * HOUR))
  const d = new Date(now - daysAgo * 24 * HOUR)
  d.setHours(startHour, 7, 0, 0)
  return d
}

await migrate(db, { migrationsFolder: "./drizzle" })

const userId = randomUUID()
const token = randomUUID()
await db.insert(users).values({ id: userId, ...DEMO_USER, emailVerified: true, image: null })
await db.insert(sessions).values({
  id: randomUUID(),
  userId,
  token,
  expiresAt: new Date(now + 7 * 24 * HOUR),
  ipAddress: null,
  userAgent: null,
})

const quoteRows = QUOTES.map((q, i) => {
  const at = new Date(now - (i * 15 + 5) * HOUR).toISOString()
  return {
    id: randomUUID(),
    userId,
    text: q.text,
    sourceUrl: `https://en.wikipedia.org/wiki/${q.slug}`,
    sourceTitle: `${q.author}, ${q.work}`,
    contentHash: createHash("sha256").update(q.text.trim()).digest("hex"),
    categorizationStatus: "pending" as const,
    createdAt: at,
    updatedAt: at,
  }
})
await db.insert(quotes).values(quoteRows)

const untaggedCount = async () =>
  (
    await db
      .select({ id: quotes.id })
      .from(quotes)
      .leftJoin(quoteTags, and(eq(quoteTags.quoteId, quotes.id), eq(quoteTags.userId, userId)))
      .where(and(eq(quotes.userId, userId), isNull(quoteTags.quoteId)))
  ).length

for (let pass = 0; pass < 3 && (await untaggedCount()) > 0; pass++) {
  await consolidateGraph(userId)
}

const localSessions: Record<string, unknown> = {}
let reportSessionId = ""
for (const s of DEMO_SESSIONS) {
  const id = randomUUID()
  const topicId = await ensureTopicId(userId, s.topic)
  const startedAt = startOf(s.daysAgo, s.startHour, s.durationMinutes)
  const endedAt = new Date(startedAt.getTime() + s.durationMinutes * 60 * 1000)
  await db.insert(focusSessions).values({
    id,
    userId,
    goal: s.goal,
    topic: s.topic,
    topicId,
    durationMinutes: s.durationMinutes,
    breakMinutes: 5,
    completed: true,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
  })
  const step = (s.durationMinutes * 60 * 1000) / (s.pages.length + 1)
  await db.insert(sessionUrls).values(
    s.pages.map((p, i) => ({
      id: randomUUID(),
      userId,
      sessionId: id,
      url: p.url,
      hostname: new URL(p.url).hostname,
      title: p.title,
      content: p.content,
      visitedAt: new Date(startedAt.getTime() + (i + 1) * step).toISOString(),
      category: "research",
      distractionScore: 6 + i * 3,
    })),
  )
  await runCompletionDownstream(userId, id)
  if (s.goal === DEMO_REPORT_GOAL) {
    reportSessionId = id
    await maybeGenerateSummary(userId, id, { force: true })
    for (const artifact of ["studyTips", "recallQuestions", "resourceRecommendations"] as const) {
      await forceRegenerate(userId, id, artifact)
    }
  }
  localSessions[id] = {
    id,
    goal: s.goal,
    title: null,
    topic: s.topic,
    topicId,
    durationMinutes: s.durationMinutes,
    breakMinutes: 5,
    completed: true,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
  }
}

const [report] = await db
  .select()
  .from(focusSessions)
  .where(and(eq(focusSessions.id, reportSessionId), eq(focusSessions.userId, userId)))
const missing = (
  ["summary", "studyTips", "recallQuestions", "resourceRecommendations"] as const
).filter((k) => !report?.[k])
const stillUntagged = await untaggedCount()
if (missing.length > 0 || stillUntagged > 0) {
  console.error(`seed-demo: incomplete seed (report missing: ${missing.join(", ") || "none"}; untagged quotes: ${stillUntagged})`)
  process.exit(1)
}

writeFileSync(
  storageOut,
  JSON.stringify(
    {
      reportSessionId,
      storage: {
        "focusquote.authToken": token,
        "focusquote.user": { id: userId, email: DEMO_USER.email, name: DEMO_USER.name, image: null },
        "focusquote.sessions": localSessions,
      },
    },
    null,
    2,
  ),
)
console.log(
  `[seed-demo] ${DEMO_USER.email}: ${quoteRows.length} quotes, ${DEMO_SESSIONS.length} sessions, report session ${reportSessionId}`,
)
libsql.close()
