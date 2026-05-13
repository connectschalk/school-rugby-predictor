import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import { getSchoolTeamLogoPath } from '@/lib/school-team-logos'
import { getPublicSiteUrl } from '@/lib/site-url'

export type OneMatchOgMatch = {
  home_team: string
  away_team: string
  kickoff_time: string
  home_team_logo: string | null
  away_team_logo: string | null
  crowd_line: string | null
}

type GmRow = { home_team: string; away_team: string; kickoff_time: string }

function unwrapGm(row: { game_matches: unknown }): GmRow | null {
  const g = row.game_matches as GmRow | GmRow[] | null
  if (!g) return null
  if (Array.isArray(g)) return g[0] ?? null
  return g
}

function absoluteLogoFromSchoolMap(base: string, teamName: string): string | null {
  const path = getSchoolTeamLogoPath(teamName)
  return path ? `${base}${path}` : null
}

async function fetchCrowdLine(
  supabase: SupabaseClient,
  challengeId: string,
  homeName: string,
  awayName: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('one_match_predictions')
    .select('predicted_winner')
    .eq('challenge_id', challengeId)

  if (error || !data?.length) return null

  let home = 0
  let away = 0
  for (const row of data as { predicted_winner: string }[]) {
    if (row.predicted_winner === 'home') home += 1
    else if (row.predicted_winner === 'away') away += 1
  }
  const total = home + away
  if (total < 3) return null

  const pct = (n: number) => Math.round((100 * n) / total)
  if (home > away) return `Crowd lean: ${pct(home)}% ${homeName}`
  if (away > home) return `Crowd lean: ${pct(away)}% ${awayName}`
  return `Crowd: ${pct(home)}% ${homeName} / ${pct(away)}% ${awayName}`
}

/** e.g. Saturday, 09 May • 12:30 (South Africa local) */
export function formatOneMatchKickoffOg(iso: string): string {
  try {
    const d = new Date(iso)
    const tz = 'Africa/Johannesburg'
    const weekday = new Intl.DateTimeFormat('en-ZA', { timeZone: tz, weekday: 'long' }).format(d)
    const day = new Intl.DateTimeFormat('en-ZA', { timeZone: tz, day: 'numeric' }).format(d)
    const month = new Intl.DateTimeFormat('en-ZA', { timeZone: tz, month: 'long' }).format(d)
    const time = new Intl.DateTimeFormat('en-ZA', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
    return `${weekday} ${day} ${month} • ${time}`
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
    .select('id, game_matches ( home_team, away_team, kickoff_time )')
    .eq('slug', slug.trim())
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  const row = data as { id: string; game_matches: unknown }
  const gm = unwrapGm(row)
  if (!gm) return null

  const base = getPublicSiteUrl()
  const home_team_logo = absoluteLogoFromSchoolMap(base, gm.home_team)
  const away_team_logo = absoluteLogoFromSchoolMap(base, gm.away_team)
  const crowd_line = await fetchCrowdLine(supabase, row.id, gm.home_team, gm.away_team)

  return {
    home_team: gm.home_team,
    away_team: gm.away_team,
    kickoff_time: gm.kickoff_time,
    home_team_logo,
    away_team_logo,
    crowd_line,
  }
}

export async function buildOneMatchShareMetadata(slug: string): Promise<Metadata> {
  const trimmed = slug.trim()
  const base = getPublicSiteUrl()
  const match = await fetchOneMatchOgBySlug(trimmed)
  const home_team = match?.home_team ?? 'Home'
  const away_team = match?.away_team ?? 'Away'
  const formatted_time = match ? formatOneMatchKickoffOg(match.kickoff_time) : ''
  const title = `${home_team} vs ${away_team}`
  const description = formatted_time
    ? `Kickoff: ${formatted_time}. Predict the winner and margin with NextPlay Predictor.`
    : 'Predict the winner and margin. Lock in your pick with NextPlay Predictor.'

  const encodedSlug = encodeURIComponent(trimmed)
  const ogImageUrl = `${base}/game/${encodedSlug}/opengraph-image`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${base}/one-match/${encodeURIComponent(trimmed)}`,
      type: 'website',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}
