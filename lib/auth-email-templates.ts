import { DEFAULT_MEMORY_MAP_LOGO_SRC } from '@/lib/memory-map/branding'
import { NEXTPLAY_EMAIL_LOGO_SRC } from '@/lib/platform-branding'
import { getPublicSiteUrl } from '@/lib/site-url'

export const MEMORY_MAP_CONFIRM_SIGNUP_SUBJECT = 'Confirm your Memory Map account'
export const PREDICTOR_CONFIRM_SIGNUP_SUBJECT = 'Confirm your NextPlay Predictor account'

const EMAIL_STYLES = {
  body: 'margin:0;padding:0;background:#05080d;font-family:system-ui,-apple-system,sans-serif;',
  card: 'max-width:520px;margin:0 auto;padding:32px 24px;',
  logo: 'display:block;margin:0 auto 20px;height:56px;width:auto;',
  heading: 'margin:0 0 12px;font-size:20px;font-weight:700;color:#ffffff;text-align:center;',
  text: 'margin:0 0 16px;font-size:15px;line-height:1.55;color:#cbd5e1;',
  buttonWrap: 'margin:0 0 24px;text-align:center;',
  button:
    'display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#050505;background:#ffd400;border-radius:10px;text-decoration:none;border:2px solid #ffd400;',
  footer: 'margin:0;font-size:13px;line-height:1.5;color:#94a3b8;text-align:center;',
} as const

function absoluteAsset(path: string): string {
  const trimmed = path.startsWith('/') ? path : `/${path}`
  return `${getPublicSiteUrl()}${trimmed}`
}

/** Reference HTML for Memory Map confirm-signup (Supabase uses `{{ .ConfirmationURL }}`). */
export function memoryMapConfirmSignupHtml(confirmationUrlPlaceholder = '{{ .ConfirmationURL }}'): string {
  const logoUrl = absoluteAsset(DEFAULT_MEMORY_MAP_LOGO_SRC)
  return `<!DOCTYPE html>
<html lang="en">
<body style="${EMAIL_STYLES.body}">
  <div style="${EMAIL_STYLES.card}">
    <img src="${logoUrl}" alt="NextPlay Memory Map" width="148" height="130" style="${EMAIL_STYLES.logo}" />
    <h2 style="${EMAIL_STYLES.heading}">Welcome to NextPlay Memory Map</h2>
    <p style="${EMAIL_STYLES.text}">Thanks for signing up.</p>
    <p style="${EMAIL_STYLES.text}">
      Your Memory Map profile helps you add stories, photos and videos to places on a map.
      Your email will never be shown publicly.
    </p>
    <p style="${EMAIL_STYLES.text}">
      Click below to verify your account and continue to Memory Map.
    </p>
    <p style="${EMAIL_STYLES.buttonWrap}">
      <a href="${confirmationUrlPlaceholder}" style="${EMAIL_STYLES.button}">Verify account and continue</a>
    </p>
    <p style="${EMAIL_STYLES.footer}">If you didn&apos;t create an account, you can ignore this email.</p>
  </div>
</body>
</html>`
}

/** Reference HTML for Predictor confirm-signup (Supabase uses `{{ .ConfirmationURL }}`). */
export function predictorConfirmSignupHtml(confirmationUrlPlaceholder = '{{ .ConfirmationURL }}'): string {
  const logoUrl = absoluteAsset(NEXTPLAY_EMAIL_LOGO_SRC)
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <img src="${logoUrl}" alt="NextPlay Predictor" width="120" height="120" style="display:block;margin:0 auto 20px;height:56px;width:auto;" />
    <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111318;text-align:center;">Welcome to NextPlay Predictor</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#374151;">
      Thanks for joining <strong>NextPlay Predictor</strong>. Your
      <strong>display name</strong> and <strong>letter avatar</strong> are shown publicly on leaderboards and match banter — not your email.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#374151;">
      Tap the button below to verify your email. You&apos;ll be asked to log in on the site to start predicting.
    </p>
    <p style="margin:0 0 24px;text-align:center;">
      <a href="${confirmationUrlPlaceholder}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;background:#111318;border-radius:10px;text-decoration:none;border:2px solid #111318;">
        Verify account and log in
      </a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;text-align:center;">
      If you didn&apos;t create an account, you can ignore this email.
    </p>
  </div>
</body>
</html>`
}

/**
 * Combined Supabase Dashboard template body (Confirm signup).
 * Branches on `signup_product` in signUp `options.data` (`.Data.signup_product`).
 */
export function supabaseConfirmSignupHtmlTemplate(): string {
  const mmLogo = absoluteAsset(DEFAULT_MEMORY_MAP_LOGO_SRC)
  const predictorLogo = absoluteAsset(NEXTPLAY_EMAIL_LOGO_SRC)
  return `{{ if eq .Data.signup_product "memory_map" }}
<h2 style="margin:0 0 12px;font-family:system-ui,sans-serif;font-size:20px;color:#f8fafc;text-align:center;">Welcome to NextPlay Memory Map</h2>
<p style="margin:0 0 16px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#cbd5e1;text-align:center;">
  <img src="${mmLogo}" alt="NextPlay Memory Map" width="148" height="130" style="display:block;margin:0 auto 20px;height:56px;width:auto;" />
</p>
<p style="margin:0 0 16px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#cbd5e1;">Thanks for signing up.</p>
<p style="margin:0 0 16px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#cbd5e1;">
  Your Memory Map profile helps you add stories, photos and videos to places on a map. Your email will never be shown publicly.
</p>
<p style="margin:0 0 20px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#cbd5e1;">
  Click below to verify your account and continue to Memory Map.
</p>
<p style="margin:0 0 24px;text-align:center;">
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 22px;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#050505;background:#ffd400;border-radius:10px;text-decoration:none;border:2px solid #ffd400;">
    Verify account and continue
  </a>
</p>
<p style="margin:0;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;color:#94a3b8;text-align:center;">
  If you didn&apos;t create an account, you can ignore this email.
</p>
{{ else }}
<h2 style="margin:0 0 12px;font-family:system-ui,sans-serif;font-size:20px;color:#111318;text-align:center;">Welcome to NextPlay Predictor</h2>
<p style="margin:0 0 16px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#374151;text-align:center;">
  <img src="${predictorLogo}" alt="NextPlay Predictor" width="120" height="120" style="display:block;margin:0 auto 20px;height:56px;width:auto;" />
</p>
<p style="margin:0 0 16px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#374151;">
  Thanks for joining <strong>NextPlay Predictor</strong>. Your <strong>display name</strong> and <strong>letter avatar</strong> are shown publicly on leaderboards and match banter — not your email.
</p>
<p style="margin:0 0 20px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#374151;">
  Tap the button below to verify your email. You&apos;ll be asked to log in on the site to start predicting.
</p>
<p style="margin:0 0 24px;text-align:center;">
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 22px;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#ffffff;background:#111318;border-radius:10px;text-decoration:none;border:2px solid #111318;">
    Verify account and log in
  </a>
</p>
<p style="margin:0;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;color:#6b7280;text-align:center;">
  If you didn&apos;t create an account, you can ignore this email.
</p>
{{ end }}`
}

export function supabaseConfirmSignupSubjectTemplate(): string {
  return `{{ if eq .Data.signup_product "memory_map" }}${MEMORY_MAP_CONFIRM_SIGNUP_SUBJECT}{{ else }}${PREDICTOR_CONFIRM_SIGNUP_SUBJECT}{{ end }}`
}
