import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type UsageEventBody = {
  event_type?: string
  page?: string | null
  details?: Record<string, unknown>
  session_id?: string | null
}

export async function POST(request: Request) {
  let body: UsageEventBody
  try {
    body = (await request.json()) as UsageEventBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = String(body.event_type ?? '').trim()
  if (!eventType) {
    return NextResponse.json({ ok: false, error: 'event_type required' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  let userEmail: string | null = null
  if (token) {
    const userClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user },
    } = await userClient.auth.getUser()
    userEmail = user?.email ?? null
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await admin.from('usage_events').insert([
    {
      event_type: eventType,
      page: body.page ?? null,
      details: body.details ?? {},
      user_email: userEmail,
      session_id: body.session_id ?? null,
    },
  ])

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
