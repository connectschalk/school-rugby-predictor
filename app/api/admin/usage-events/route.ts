import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-api-auth'

export async function GET(request: Request) {
  const ctx = await requireAdminApi(request)
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.supabase
    .from('usage_events')
    .select('id, created_at, event_type, page, details, user_email, session_id')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, rows: data ?? [] })
}
