import { env } from "../env"
import { renderMagicLinkHtml, renderMagicLinkText } from "./magic-link-template"

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
      text: renderMagicLinkText(url),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`resend send failed: ${res.status} ${detail.slice(0, 200)}`)
  }
}
