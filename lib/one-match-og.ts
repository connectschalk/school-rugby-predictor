import { createClient } from '@supabase/supabase-js'
import { getSchoolTeamLogoPath } from '@/lib/school-team-logos'

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

/** e.g. Saturday 9 May • 12:30 */
export function formatOneMatchKickoffOg(iso: string): string {
  try {
    const d = new Date(iso)
    const day = d.toLocaleDateString('en-ZA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    const time = d.toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return `${day} • ${time}`
  } catch {
    return iso
  }
}

/** Absolute URL for team crest under `public/`. */
export function absoluteTeamLogoUrl(teamName: string, siteOrigin: string): string {
  const origin = siteOrigin.replace(/\/+$/, '')
  const rel =
    getSchoolTeamLogoPath(teamName) ??
    `/team-logos/${teamName.trim().toLowerCase().replace(/\s+/g, '-')}.png`
  return `${origin}${rel.startsWith('/') ? rel : `/${rel}`}`
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
