// ---------------------------------------------------------------------------
// Magic-link email template — FocusQuote "Direction A" visual system.
//
// Kept free of any env / side-effecting imports so it can be rendered in
// isolation (see scripts/preview-magic-link.ts).
//
// Email-client constraints baked in here on purpose:
//  - Table-based layout (Outlook/Gmail ignore flexbox/grid).
//  - All styles inline (the <style> block is only for the font link + a couple
//    of @media tweaks; every text element carries a real fallback stack inline).
//  - Bulletproof button rendered as a single-cell table so Outlook fills it.
//
// Logo: email clients strip inline SVG and relative asset paths won't resolve,
// and we don't have a hosted PNG of the mark yet, so the masthead renders a
// 38×38 rounded amber square with white "FQ" as a placeholder.
// TODO: replace the placeholder cell with <img src="https://.../logo-mark.png"
//       width="38" height="38" ...> once the mark is hosted on our CDN.
// ---------------------------------------------------------------------------

const SERIF = "'Newsreader', 'Iowan Old Style', Georgia, serif"
const SANS = "'Geist', -apple-system, system-ui, 'Segoe UI', sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"

export const renderMagicLinkHtml = (url: string, minutes = 5) => {
  const safeUrl = escapeHtml(url)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Your FocusQuote sign-in link</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600&family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  body { margin: 0; padding: 0; width: 100% !important; }
  a { text-decoration: none; }
  @media only screen and (max-width: 520px) {
    .fq-card { width: 100% !important; }
    .fq-pad { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:#E9E7E1;">
  <!-- preheader / preview text (hidden) -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#E9E7E1; opacity:0;">Your FocusQuote sign-in link — expires in ${minutes} minutes.</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E9E7E1;">
    <tr>
      <td align="center" style="padding:56px 16px;">

        <!-- card -->
        <table role="presentation" class="fq-card" width="488" cellpadding="0" cellspacing="0" border="0" style="width:488px; max-width:488px; background:#FBFAF6; border:1px solid #DAD3C2; border-radius:16px; overflow:hidden;">

          <!-- masthead -->
          <tr>
            <td class="fq-pad" style="padding:30px 36px 24px; border-bottom:1px solid #E5E0D5;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="width:38px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="38" height="38" style="width:38px; height:38px; background:#F2A03C; border-radius:11px;">
                      <tr>
                        <td align="center" valign="middle" style="width:38px; height:38px; font-family:${SERIF}; font-size:16px; font-weight:600; color:#ffffff; line-height:38px; text-align:center;">FQ</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle" style="padding-left:12px; font-family:${SERIF}; font-size:21px; font-weight:600; letter-spacing:-0.01em; line-height:1; color:#1A1814;">Focus<span style="color:#C77A1F;">Quote</span></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- body -->
          <tr>
            <td class="fq-pad" style="padding:34px 36px 30px;">
              <p style="margin:0 0 14px; font-family:${MONO}; font-size:10.5px; font-weight:500; letter-spacing:0.14em; text-transform:uppercase; color:#807A6F;">Sign-in link</p>

              <h1 style="margin:0 0 14px; font-family:${SERIF}; font-size:30px; font-weight:600; letter-spacing:-0.02em; line-height:1.12; color:#1A1814;">Here's your link back in.</h1>

              <p style="margin:0 0 26px; font-family:${SANS}; font-size:14.5px; line-height:1.6; color:#3A362F;">Tap the button below to sign in to FocusQuote. No password needed — this link does the work.</p>

              <!-- bulletproof button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#F2A03C" style="background:#F2A03C; border:1px solid #C77A1F; border-radius:10px;">
                    <a href="${safeUrl}" target="_blank" style="display:inline-block; font-family:${SANS}; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; padding:13px 24px; border-radius:10px;">Sign in to FocusQuote</a>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0; font-family:${SANS}; font-size:12.5px; color:#807A6F;">Expires in ${minutes} minutes, single use.</p>

              <!-- fallback -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px; border-top:1px solid #E5E0D5;">
                <tr>
                  <td style="padding-top:22px;">
                    <p style="margin:0 0 8px; font-family:${SANS}; font-size:12px; color:#807A6F;">Button not working? Paste this into your browser:</p>
                    <p style="margin:0; font-family:${MONO}; font-size:11.5px; line-height:1.5; color:#3A362F; word-break:break-all; background:#F4F2EC; border:1px solid #E5E0D5; border-radius:8px; padding:10px 12px;">${safeUrl}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td class="fq-pad" style="padding:20px 36px 26px; background:#F4F2EC; border-top:1px solid #E5E0D5;">
              <p style="margin:0 0 6px; font-family:${SANS}; font-size:11.5px; line-height:1.6; color:#3A362F;">Didn't request this? You can safely ignore this email — nothing will happen without the link.</p>
              <p style="margin:0; font-family:${SANS}; font-size:11.5px; line-height:1.6; color:#807A6F;">FocusQuote · Sent because someone entered this address to sign in.</p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}

export const renderMagicLinkText = (url: string, minutes = 5) =>
  `Sign in to FocusQuote

Tap the link below to sign in. No password needed — this link does the work.

${url}

Expires in ${minutes} minutes, single use.

Didn't request this? You can safely ignore this email — nothing will happen without the link.

FocusQuote`

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
