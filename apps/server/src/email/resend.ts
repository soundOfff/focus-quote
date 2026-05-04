import { env } from "../env"

/**
 * Sends a magic-link email via Resend.
 * If RESEND_API_KEY is unset, logs the URL to stdout for local dev.
 */
export async function sendMagicLinkEmail(
  email: string,
  url: string,
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.log(`[email/dev] Magic link for ${email}: ${url}`)
    return
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: "Your FocusQuote sign-in link",
      html: renderMagicLinkHtml(url),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`resend send failed: ${res.status} ${detail.slice(0, 200)}`)
  }
}

const renderMagicLinkHtml = (url: string) => `
<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; padding: 24px; color: #2d2d2d;">
    <h2 style="color: #e94560; margin: 0 0 16px;">FocusQuote</h2>
    <p>Click the link below to sign in. It expires in 5 minutes.</p>
    <p style="margin: 24px 0;">
      <a href="${url}" style="display: inline-block; background: #e94560; color: white; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 500;">
        Sign in to FocusQuote
      </a>
    </p>
    <p style="font-size: 12px; color: #888;">
      If you didn't request this, you can safely ignore the email.
    </p>
  </body>
</html>
`
