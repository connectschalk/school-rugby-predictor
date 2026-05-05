import { createClient } from '@supabase/supabase-js'

export type OneMatchOgMatch = {
  home_team: string
  away_team: string
  kickoff_time: string
}

function unwrapGm(row: { game_matches: unknown }): OneMatchOgMatch | null {
  const g = row.game_matches as OneMatchOgMatch | OneMatchOgMatch[] | null
  if (!g) return null
  if (Array.isArray(g)) return g[0] ?? null
  return g
}

/** e.g. Saturday, 09 May • 12:30 (South Africa local) */
export function formatOneMatchKickoffOg(iso: string): string {
  try {
    const d = new Date(iso)
    const tz = 'Africa/Johannesburg'
    const weekday = new Intl.DateTimeFormat('en-ZA', { timeZone: tz, weekday: 'long' }).format(d)
    const day = new Intl.DateTimeFormat('en-ZA', { timeZone: tz, day: '2-digit' }).format(d)
    const month = new Intl.DateTimeFormat('en-ZA', { timeZone: tz, month: 'long' }).format(d)
    const time = new Intl.DateTimeFormat('en-ZA', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
    return `${weekday}, ${day} ${month} • ${time}`
  } catch {
    return iso
  }
}

export async function fetchOneMatchOgBySlug(slug: string): Promise<OneMatchOgMatch | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || !slug?.trim()) return null

  const supabase = createClient(url, key)
  const { data, error } = await supabase
    .from('one_match_challenges')
    .select('game_matches ( home_team, away_team, kickoff_time )')
    .eq('slug', slug.trim())
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  return unwrapGm(data as { game_matches: unknown })
}
