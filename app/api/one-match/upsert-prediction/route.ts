import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() ?? ''
}

function hashIp(ip: string): string | null {
  if (!ip) return null
  const pepper = process.env.ONE_MATCH_IP_PEPPER ?? 'school-rugby-one-match'
  return createHash('sha256').update(`${pepper}:${ip}`, 'utf8').digest('hex')
}

type Body = {
  challenge_slug?: string
  browser_token?: string
  display_name?: string
  predicted_winner?: string
  predicted_margin?: number
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const slug = typeof body.challenge_slug === 'string' ? body.challenge_slug.trim() : ''
  const browserToken = typeof body.browser_token === 'string' ? body.browser_token.trim() : ''
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  const winner = typeof body.predicted_winner === 'string' ? body.predicted_winner.trim().toLowerCase() : ''
  const margin = body.predicted_margin

  if (!slug || slug.length > 200) {
    return NextResponse.json({ error: 'Invalid challenge' }, { status: 400 })
  }
  if (browserToken.length < 8 || browserToken.length > 200) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 })
  }
  if (!displayName || displayName.length > 120) {
    return NextResponse.json({ error: 'Enter your name' }, { status: 400 })
  }
  if (winner !== 'home' && winner !== 'away') {
    return NextResponse.json({ error: 'Pick a winning team' }, { status: 400 })
  }
  if (typeof margin !== 'number' || !Number.isFinite(margin) || margin < 1 || margin > 200) {
    return NextResponse.json({ error: 'Margin must be between 1 and 200' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const ipHash = hashIp(clientIp(req))
  const supabase = createClient(url, anonKey)

  const { data, error } = await supabase.rpc('upsert_one_match_prediction', {
    p_challenge_slug: slug,
    p_browser_token: browserToken,
    p_display_name: displayName,
    p_predicted_winner: winner,
    p_predicted_margin: Math.round(margin),
    p_ip_hash: ipHash,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('predictions closed') || msg.includes('challenge not found')) {
      return NextResponse.json({ error: 'Predictions are closed for this match.' }, { status: 409 })
    }
    if (msg.includes('invalid')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Could not save prediction' }, { status: 500 })
  }

  const row = Array.isArray(data) ? data[0] : data
  const id = row && typeof row === 'object' && 'id' in row ? (row as { id: string }).id : null
  const duplicateNameIpHint =
    row &&
    typeof row === 'object' &&
    'duplicate_name_ip_hint' in row &&
    !!(row as { duplicate_name_ip_hint: boolean }).duplicate_name_ip_hint

  return NextResponse.json({ id, duplicate_name_ip_hint: duplicateNameIpHint })
}
