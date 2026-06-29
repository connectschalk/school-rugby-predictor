# Supabase Auth email templates

Confirmation and reset emails are sent by **Supabase Auth** (not the Next.js app). Configure in the Supabase Dashboard under **Authentication → Email Templates**.

The app tags signups with `signup_product` in `signUp({ options: { data } })`:

| Product | `signup_product` value | Sign-up UI |
|---------|------------------------|------------|
| Predictor | `predictor` | `/signup` |
| Memory Map | `memory_map` | `/memory-map/auth/sign-up` |

Templates read this via **`.Data.signup_product`** (Go template syntax).

## Sender display name

Under **Authentication → SMTP Settings** (or **Project Settings → Auth**), set the sender name to **`NextPlay`** so it is not product-specific. Per-product sender names require a custom Auth Hook or SMTP integration.

Avoid legacy names such as **School Predictor** or **School Rugby Predictor**.

## Confirm signup (required)

See **[confirm-signup.md](./confirm-signup.md)** for the combined subject + HTML body that branches on `signup_product`.

After pasting the template:

1. Keep **`{{ .ConfirmationURL }}`** on the primary button link.
2. Add all `emailRedirectTo` URLs under **Authentication → URL configuration → Redirect URLs** (including `/auth/callback?...` for both products).

Reference HTML generators (for review/tests): `lib/auth-email-templates.ts`

## Product-specific reference copies

- [confirm-signup-memory-map.md](./confirm-signup-memory-map.md) — Memory Map only
- [confirm-signup-predictor.md](./confirm-signup-predictor.md) — Predictor only

## Password reset (optional)

Reset emails use the **Reset password** template. Memory Map forgot-password sets `redirectTo` under `/memory-map/*`. Consider a similar `signup_product` or `redirectTo` branch if reset copy still mentions Predictor.
