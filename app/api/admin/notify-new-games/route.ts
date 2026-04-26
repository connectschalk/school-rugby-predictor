import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchUserIsAdmin } from '@/lib/admin-access'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing Authorization bearer token' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 })
  }

  const supabaseUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser()

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const { isAdmin, error: roleErr } = await fetchUserIsAdmin(supabaseUser, user.id)
  if (roleErr || !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const resendKey = process.env.RESEND_API_KEY
  const emailFrom = process.env.EMAIL_FROM

  if (!resendKey || !emailFrom) {
    return NextResponse.json({
      ok: true,
      emailProviderReady: false,
      message: 'Fixtures added. Email provider not configured yet.',
    })
  }

  // TODO(Resend): POST https://api.resend.com/emails — set `from: emailFrom`, `subject`, `html` or `text`.
  // TODO(Recipients): Emails live on `auth.users`, not `user_profiles`. Use a server-only
  //   `SUPABASE_SERVICE_ROLE_KEY` with `createClient(url, serviceRoleKey)` and paginate
  //   `supabase.auth.admin.listUsers({ perPage: 1000, page })`, collecting `user.email`.
  // TODO(Alternative): Supabase Edge Function + service role + Resend (keeps secrets off Next).
  // Until the above is implemented, do not claim emails were sent.

  return NextResponse.json({
    ok: true,
    emailProviderReady: false,
    message:
      'RESEND_API_KEY and EMAIL_FROM are set, but bulk notify is not implemented yet (see TODOs in notify-new-games route).',
  })
}
