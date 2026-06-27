import { NextResponse } from 'next/server'
import { isValidGeocodeQuery, searchNominatim } from '@/lib/memory-map/geocode'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim() ?? ''

    if (!isValidGeocodeQuery(q)) {
      return NextResponse.json(
        { ok: false, error: 'Query must be at least 3 characters.', results: [] },
        { status: 400 }
      )
    }

    const results = await searchNominatim(q, { countryCodes: 'za', limit: 5 })
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('[memory-map:geocode]', err)
    return NextResponse.json(
      { ok: false, error: 'Geocoding is temporarily unavailable.', results: [] },
      { status: 502 }
    )
  }
}
