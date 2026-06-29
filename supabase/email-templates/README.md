# Supabase Auth email templates

Confirmation and reset emails are sent by **Supabase Auth** (not the Next.js app). Configure in the Supabase Dashboard under **Authentication → Email Templates**.

> **Dashboard changes required:** Subject, HTML body, logo, and sender display name are **not** deployed from this repo. You must paste the template below and update SMTP/sender settings manually in Supabase.

The app tags signups with `signup_product` in `signUp({ options: { data } })`:

| Product | `signup_product` value | Sign-up UI |
|---------|------------------------|------------|
| Predictor | `predictor` | `/signup` |
| Memory Map | `memory_map` | `/memory-map/auth/sign-up`, organisation admin invites |

Templates read this via **`.Data.signup_product`** (Go template syntax). Without the branching template, all users receive the default **Confirm signup** copy (often legacy “School Rugby Predictor” / Predictor logo).

## Sender display name

Under **Authentication → SMTP Settings** (or **Project Settings → Auth**), set the sender name to **`NextPlay`** so it is not product-specific. Per-product sender names require a custom Auth Hook or SMTP integration.

Avoid legacy names such as **School Predictor** or **School Rugby Predictor**.

## Shared email logo (public URL)

Auth email templates can embed the NextPlay mark from:

**https://www.thenextplay.co.za/nextplay-email-logo.png**

File in repo: `public/nextplay-email-logo.png` (copied from `nextplay-predictor-logo.png`). Memory Map confirm-signup may use the product logo at `/memory-map/default-memory-map-logo.png` instead; Predictor and generic templates use the shared email logo above.

## Site URL and redirect URLs (required)

Set in **Authentication → URL configuration**:

| Setting | Value |
|---------|--------|
| **Site URL** | Your deployed app URL — same as `NEXT_PUBLIC_APP_URL` in Vercel (e.g. `https://www.thenextplay.co.za`) |
| **Redirect URLs** | `https://your-domain/auth/callback`, `https://your-domain/auth/callback?**`, `https://your-domain/auth/update-password`, `https://your-domain/auth/update-password?**` |

Memory Map sign-ups set `emailRedirectTo` via `buildMemoryMapEmailConfirmCallbackUrl()` in `lib/auth-redirect.ts`, which resolves to:

`${NEXT_PUBLIC_APP_URL}/auth/callback?next=/memory-map/auth/sign-in?next=...`

After the user confirms, `/auth/callback` routes Memory Map users back into `/memory-map/*` (not Predictor `/login`).

## Confirm signup (required)

See **[confirm-signup.md](./confirm-signup.md)** for the combined subject + HTML body that branches on `signup_product`.

After pasting the template:

1. Keep **`{{ .ConfirmationURL }}`** on the primary button link.
2. Verify **Redirect URLs** include all `emailRedirectTo` patterns above.

Reference HTML generators (for review/tests): `lib/auth-email-templates.ts`

## Product-specific reference copies

- [confirm-signup-memory-map.md](./confirm-signup-memory-map.md) — Memory Map only
- [confirm-signup-predictor.md](./confirm-signup-predictor.md) — Predictor only

## Password reset (optional)

Reset emails use the **Reset password** template. Memory Map forgot-password sets `redirectTo` under `/memory-map/*`. Consider a similar `signup_product` or `redirectTo` branch if reset copy still mentions Predictor.
