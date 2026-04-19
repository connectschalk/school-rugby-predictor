import { NextResponse } from 'next/server'
import { parseResultsFromHtml } from '@/lib/parse-results-html'

export const runtime = 'nodejs'

function assertFetchableUrl(urlStr: string): URL {
  let u: URL
  try {
    u = new URL(urlStr)
  } catch {
    throw new Error('Invalid URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed')
  }
  const host = u.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error('URL host is not allowed')
  }
  return u
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const urlStr = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!urlStr) {
      return NextResponse.json({ ok: false, error: 'Missing url' }, { status: 400 })
    }

    assertFetchableUrl(urlStr)

    const res = await fetch(urlStr, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SchoolRugbyPredictor/1.0; +https://example.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Fetch failed: HTTP ${res.status}` },
        { status: 502 }
      )
    }

    const html = await res.text()
    const { rows, pageDate, notes } = parseResultsFromHtml(html)

    const outRows = rows.map((r) => ({
      match_date: pageDate ?? '',
      team_a_name: r.team_a_name,
      team_b_name: r.team_b_name,
      team_a_score: r.team_a_score,
      team_b_score: r.team_b_score,
    }))

    return NextResponse.json({
      ok: true,
      rows: outRows,
      pageDate,
      notes,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Parse failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
