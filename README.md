This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Environment variables

Copy `.env.example` to `.env.local` and fill in Supabase keys.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_APP_URL` | **Auth redirects** — canonical site URL for confirmation and password-reset emails (e.g. `https://www.thenextplay.co.za`) |
| `NEXT_PUBLIC_SITE_URL` | Share links / OG URLs (falls back to production default if unset) |

### Supabase Auth URL configuration

In the Supabase Dashboard under **Authentication → URL configuration**, set:

- **Site URL** — same value as `NEXT_PUBLIC_APP_URL` (your deployed Next.js app)
- **Redirect URLs** — allow at least:
  - `https://your-domain/auth/callback`
  - `https://your-domain/auth/callback?**`
  - `https://your-domain/auth/update-password`
  - `https://your-domain/auth/update-password?**`

Memory Map and Predictor share one Next.js deployment; product-specific post-confirm routing is handled in `/auth/callback` using `signup_product` metadata.

### Supabase confirmation email branding

Email **subject, body, logo, and sender name** are configured in Supabase under **Authentication → Email Templates** (not in this repo). Paste the combined template from [`supabase/email-templates/confirm-signup.md`](supabase/email-templates/confirm-signup.md) so Memory Map signups (`signup_product: memory_map`) show **NextPlay Memory Map** branding instead of legacy Predictor copy.

Also update **SMTP sender display name** (remove legacy names such as “School Predictor” or “School Rugby Predictor”). See [`supabase/email-templates/README.md`](supabase/email-templates/README.md).
