import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export type AuthenticatedApiContext = {
  supabase: SupabaseClient
  user: User
}

export async function requireAuthenticatedApi(request: Request): Promise<AuthenticatedApiContext | NextResponse> {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization bearer token' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { supabase, user }
}
