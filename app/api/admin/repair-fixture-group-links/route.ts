import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { relinkAllCompletedMatchesToFixtureGroups } from '@/lib/repair-missing-fixture-group-links'

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

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const { isAdmin, error: roleErr } = await fetchUserIsAdmin(supabase, user.id)
  if (roleErr || !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await relinkAllCompletedMatchesToFixtureGroups(supabase)
    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
