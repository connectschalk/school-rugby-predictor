# Confirm signup email (Supabase Dashboard)

Configure in **Authentication → Email Templates → Confirm signup**.

Uses **`signup_product`** from sign-up metadata (`.Data.signup_product`) to choose Memory Map vs Predictor branding.

See also: [README.md](./README.md)

## Redirect / link behaviour

- The email body must keep **`{{ .ConfirmationURL }}`** on the button link.
- Memory Map sign-up sets `emailRedirectTo` via `buildMemoryMapEmailConfirmCallbackUrl()` → `${NEXT_PUBLIC_APP_URL}/auth/callback?next=/memory-map/auth/sign-in...`
- Predictor sign-up sets `emailRedirectTo` to `/auth/callback?next=/login?confirmed=1`
- Set **Site URL** in Supabase to the same value as `NEXT_PUBLIC_APP_URL` (see `.env.example`).
- Add those full URLs under **Authentication → URL configuration → Redirect URLs**.

## Subject (paste into Supabase subject field)

```
{{ if eq .Data.signup_product "memory_map" }}Confirm your Memory Map account{{ else }}Confirm your NextPlay Predictor account{{ end }}
```

## HTML body (paste into Supabase body field)

Generate the latest combined template from code:

```bash
node -e "const t=require('./lib/auth-email-templates.ts'); console.log(t.supabaseConfirmSignupHtmlTemplate())"
```

Or paste the template below (logo URLs use production site `https://www.thenextplay.co.za` — update if your `NEXT_PUBLIC_SITE_URL` differs):

- Shared NextPlay email logo: `https://www.thenextplay.co.za/nextplay-email-logo.png`
- Memory Map product logo: `https://www.thenextplay.co.za/memory-map/default-memory-map-logo.png`

```html
{{ if eq .Data.signup_product "memory_map" }}
<h2 style="margin:0 0 12px;font-family:system-ui,sans-serif;font-size:20px;color:#f8fafc;text-align:center;">Welcome to NextPlay Memory Map</h2>
<p style="margin:0 0 16px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#cbd5e1;text-align:center;">
  <img src="https://www.thenextplay.co.za/memory-map/default-memory-map-logo.png" alt="NextPlay Memory Map" width="148" height="130" style="display:block;margin:0 auto 20px;height:56px;width:auto;" />
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
  If you didn't create an account, you can ignore this email.
</p>
{{ else }}
<h2 style="margin:0 0 12px;font-family:system-ui,sans-serif;font-size:20px;color:#111318;text-align:center;">Welcome to NextPlay Predictor</h2>
<p style="margin:0 0 16px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#374151;text-align:center;">
  <img src="https://www.thenextplay.co.za/nextplay-email-logo.png" alt="NextPlay Predictor" width="120" height="120" style="display:block;margin:0 auto 20px;height:56px;width:auto;" />
</p>
<p style="margin:0 0 16px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#374151;">
  Thanks for joining <strong>NextPlay Predictor</strong>. Your <strong>display name</strong> and <strong>letter avatar</strong> are shown publicly on leaderboards and match banter — not your email.
</p>
<p style="margin:0 0 20px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#374151;">
  Tap the button below to verify your email. You'll be asked to log in on the site to start predicting.
</p>
<p style="margin:0 0 24px;text-align:center;">
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 22px;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#ffffff;background:#111318;border-radius:10px;text-decoration:none;border:2px solid #111318;">
    Verify account and log in
  </a>
</p>
<p style="margin:0;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;color:#6b7280;text-align:center;">
  If you didn't create an account, you can ignore this email.
</p>
{{ end }}
```

## Plain-text alternative (optional)

Use the same product branch; primary link must remain **`{{ .ConfirmationURL }}`**.
