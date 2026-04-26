# Confirm signup email (Supabase Dashboard)

Configure in **Authentication → Email Templates → Confirm signup**.

## Redirect / link behaviour

- The email body must keep the Supabase placeholder **`{{ .ConfirmationURL }}`** as the button (or primary) link so verification still works.
- In your app, `signUp` sets **`emailRedirectTo`** to your app route (e.g. `/auth/callback?...`). Add that full URL under **Authentication → URL configuration → Redirect URLs**.

## Suggested subject

**Confirm your NextPlay Predictor account**

## Suggested HTML body (paste into Supabase, keep `{{ .ConfirmationURL }}` on the button)

```html
<h2 style="margin:0 0 12px;font-family:system-ui,sans-serif;font-size:20px;color:#111318;">
  Welcome to NextPlay Predictor
</h2>
<p style="margin:0 0 16px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#374151;">
  Thanks for joining <strong>School Rugby Predictor</strong> (NextPlay Predictor). Your
  <strong>display name</strong> and <strong>letter avatar</strong> are shown publicly on leaderboards and match banter — not your email.
</p>
<p style="margin:0 0 20px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#374151;">
  Tap the button below to verify your email. You’ll be asked to log in on the site to start predicting.
</p>
<p style="margin:0 0 24px;">
  <a
    href="{{ .ConfirmationURL }}"
    style="display:inline-block;padding:12px 22px;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#ffffff;background:#111318;border-radius:10px;text-decoration:none;border:2px solid #111318;"
  >
    Verify account and log in
  </a>
</p>
<p style="margin:0;font-family:system-ui,sans-serif;font-size:13px;color:#6b7280;">
  If you didn’t create an account, you can ignore this email.
</p>
```

## Plain-text alternative (optional)

Use the same tone; primary link must remain **`{{ .ConfirmationURL }}`**.
