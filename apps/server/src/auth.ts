import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { magicLink, bearer } from "better-auth/plugins"
import { db } from "./db/client"
import { env } from "./env"
import { sendMagicLinkEmail } from "./email/resend"

const socialProviders =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "sqlite", usePlural: true }),
  trustedOrigins: [env.EXTENSION_ORIGIN, env.BETTER_AUTH_URL],
  emailAndPassword: { enabled: false },
  socialProviders,
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, rewriteMagicLinkUrl(url))
      },
      expiresIn: 60 * 5,
    }),
    bearer(),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once a day on use
  },
})

export type Auth = typeof auth

/**
 * Rewrites Better Auth's default magic-link URL (which would 302 directly to
 * the chrome-extension callback and drop the bearer token) to point at our
 * same-origin bridge page, which can read the token from a JSON response and
 * forward it to the extension via URL fragment.
 */
function rewriteMagicLinkUrl(url: string): string {
  const parsed = new URL(url)
  const token = parsed.searchParams.get("token")
  const callbackURL = parsed.searchParams.get("callbackURL")
  if (!token || !callbackURL) return url
  const bridge = new URL("/auth/magic-bridge", env.BETTER_AUTH_URL)
  bridge.searchParams.set("vt", token)
  bridge.searchParams.set("ext", callbackURL)
  return bridge.toString()
}
