import { db } from "../src/db/client"
import { quotes, users } from "../src/db/schema"
import { eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { createHash } from "node:crypto"

const hashQuoteText = (text: string): string =>
  createHash("sha256").update(text.trim()).digest("hex")

const testQuotes = [
  {
    text: "The only way to do great work is to love what you do.",
    sourceUrl: "https://example.com/steve-jobs",
    sourceTitle: "Steve Jobs - Stanford Commencement",
  },
  {
    text: "Life is what happens when you're busy making other plans.",
    sourceUrl: "https://example.com/john-lennon",
    sourceTitle: "John Lennon Quotes",
  },
  {
    text: "The future belongs to those who believe in the beauty of their dreams.",
    sourceUrl: "https://example.com/eleanor-roosevelt",
    sourceTitle: "Eleanor Roosevelt Wisdom",
  },
  {
    text: "It is during our darkest moments that we must focus to see the light.",
    sourceUrl: "https://example.com/aristotle",
    sourceTitle: "Aristotle - Philosophy",
  },
  {
    text: "The only impossible journey is the one you never begin.",
    sourceUrl: "https://example.com/tony-robbins",
    sourceTitle: "Tony Robbins - Motivation",
  },
  {
    text: "In the end, we will remember not the words of our enemies, but the silence of our friends.",
    sourceUrl: "https://example.com/mlk",
    sourceTitle: "Martin Luther King Jr.",
  },
  {
    text: "The purpose of our lives is to be happy.",
    sourceUrl: "https://example.com/dalai-lama",
    sourceTitle: "Dalai Lama Teachings",
  },
  {
    text: "Life is really simple, but we insist on making it complicated.",
    sourceUrl: "https://example.com/confucius",
    sourceTitle: "Confucius - Ancient Wisdom",
  },
  {
    text: "May you live every day of your life.",
    sourceUrl: "https://example.com/jonathan-swift",
    sourceTitle: "Jonathan Swift Quotes",
  },
  {
    text: "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    sourceUrl: "https://example.com/churchill",
    sourceTitle: "Winston Churchill",
  },
  {
    text: "Believe you can and you're halfway there.",
    sourceUrl: "https://example.com/theodore-roosevelt",
    sourceTitle: "Theodore Roosevelt",
  },
  {
    text: "The best time to plant a tree was 20 years ago. The second best time is now.",
    sourceUrl: "https://example.com/chinese-proverb",
    sourceTitle: "Chinese Proverb",
  },
  {
    text: "Your time is limited, don't waste it living someone else's life.",
    sourceUrl: "https://example.com/steve-jobs-2",
    sourceTitle: "Steve Jobs - Innovation",
  },
  {
    text: "Whether you think you can or you think you can't, you're right.",
    sourceUrl: "https://example.com/henry-ford",
    sourceTitle: "Henry Ford Quotes",
  },
  {
    text: "The only limit to our realization of tomorrow will be our doubts of today.",
    sourceUrl: "https://example.com/fdr",
    sourceTitle: "Franklin D. Roosevelt",
  },
  {
    text: "Do what you can, with what you have, where you are.",
    sourceUrl: "https://example.com/teddy-roosevelt",
    sourceTitle: "Roosevelt - Action",
  },
  {
    text: "Everything you've ever wanted is on the other side of fear.",
    sourceUrl: "https://example.com/george-addair",
    sourceTitle: "George Addair",
  },
  {
    text: "Success usually comes to those who are too busy to be looking for it.",
    sourceUrl: "https://example.com/thoreau",
    sourceTitle: "Henry David Thoreau",
  },
  {
    text: "The way to get started is to quit talking and begin doing.",
    sourceUrl: "https://example.com/walt-disney",
    sourceTitle: "Walt Disney",
  },
  {
    text: "Don't let yesterday take up too much of today.",
    sourceUrl: "https://example.com/will-rogers",
    sourceTitle: "Will Rogers",
  },
  {
    text: "You learn more from failure than from success. Don't let it stop you. Failure builds character.",
    sourceUrl: "https://example.com/failure-wisdom",
    sourceTitle: "Unknown",
  },
  {
    text: "It's not whether you get knocked down, it's whether you get up.",
    sourceUrl: "https://example.com/vince-lombardi",
    sourceTitle: "Vince Lombardi",
  },
  {
    text: "If you are working on something that you really care about, you don't have to be pushed. The vision pulls you.",
    sourceUrl: "https://example.com/steve-jobs-3",
    sourceTitle: "Steve Jobs - Vision",
  },
  {
    text: "People who are crazy enough to think they can change the world, are the ones who do.",
    sourceUrl: "https://example.com/rob-siltanen",
    sourceTitle: "Rob Siltanen",
  },
  {
    text: "Failure will never overtake me if my determination to succeed is strong enough.",
    sourceUrl: "https://example.com/og-mandino",
    sourceTitle: "Og Mandino",
  },
  {
    text: "Entrepreneurs are great at dealing with uncertainty and also very good at minimizing risk. That's the classic entrepreneur.",
    sourceUrl: "https://example.com/musk",
    sourceTitle: "Elon Musk",
  },
  {
    text: "We need to accept that we won't always make the right decisions, that we'll screw up royally sometimes.",
    sourceUrl: "https://example.com/arianna-huffington",
    sourceTitle: "Arianna Huffington",
  },
  {
    text: "Don't be afraid to give up the good to go for the great.",
    sourceUrl: "https://example.com/john-rockefeller",
    sourceTitle: "John D. Rockefeller",
  },
  {
    text: "I find that the harder I work, the more luck I seem to have.",
    sourceUrl: "https://example.com/thomas-jefferson",
    sourceTitle: "Thomas Jefferson",
  },
  {
    text: "The road to success and the road to failure are almost exactly the same.",
    sourceUrl: "https://example.com/colin-davis",
    sourceTitle: "Colin R. Davis",
  },
]

async function main() {
  const userEmail = "tomibrasca97@gmail.com"

  // Find user by email
  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1)

  if (!user) {
    console.error(`User with email ${userEmail} not found`)
    process.exit(1)
  }

  console.log(`Found user: ${user.email} (${user.id})`)

  // Delete all quotes for this user
  const deleteResult = await db.delete(quotes).where(eq(quotes.userId, user.id))
  const deletedCount = (deleteResult as unknown as { rowsAffected?: number }).rowsAffected ?? 0
  console.log(`Deleted ${deletedCount} quotes`)

  // Add 30 test quotes
  const now = new Date().toISOString()
  const newQuotes = testQuotes.map((quote) => ({
    id: randomUUID(),
    userId: user.id,
    text: quote.text,
    sourceUrl: quote.sourceUrl,
    sourceTitle: quote.sourceTitle,
    contentHash: hashQuoteText(quote.text),
    categorizationStatus: "pending" as const,
    createdAt: now,
    updatedAt: now,
  }))

  await db.insert(quotes).values(newQuotes)
  console.log(`Added ${newQuotes.length} test quotes`)

  process.exit(0)
}

main().catch((err) => {
  console.error("Script failed:", err)
  process.exit(1)
})
