import type { SupabaseClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import { getOneMatchChallengeBySlug, createOneMatchAnonClient, normalizeOneMatchSlug } from '@/lib/one-match-challenge-lookup'
import { getCompetitionTeamLogoPath } from '@/lib/competition-team-logos'
import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
import { absoluteOneMatchChallengeUrl, absoluteOneMatchOgImageUrl, getPublicSiteUrl } from '@/lib/site-url'

export type OneMatchOgMatch = {
  home_team: string
  away_team: string
  kickoff_time: string
  home_team_logo: string | null
  away_team_logo: string | null
  crowd_line: string | null
}

function absoluteLogoFromSchoolMap(base: string, teamName: string): string | null {
  const path = getCompetitionTeamLogoPath(SCHOOLS_COMPETITION_SLUG, teamName)
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
  const normalizedSlug = normalizeOneMatchSlug(slug)
  const lookup = await getOneMatchChallengeBySlug(normalizedSlug, { logContext: 'og-fetch' })
  if (!lookup) return null

  const gm = lookup.match
  const base = getPublicSiteUrl()
  const home_team_logo = absoluteLogoFromSchoolMap(base, gm.home_team)
  const away_team_logo = absoluteLogoFromSchoolMap(base, gm.away_team)

  console.info('[one-match-og]', {
    slug: normalizedSlug,
    homeLogo: home_team_logo ? 'found' : 'missing',
    awayLogo: away_team_logo ? 'found' : 'missing',
  })

  const supabase = createOneMatchAnonClient()
  const crowd_line =
    supabase != null
      ? await fetchCrowdLine(supabase, lookup.challenge.id, gm.home_team, gm.away_team)
      : null

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
  const trimmed = normalizeOneMatchSlug(slug)
  const match = await fetchOneMatchOgBySlug(trimmed)
  const home_team = match?.home_team ?? 'Home'
  const away_team = match?.away_team ?? 'Away'
  const formatted_time = match ? formatOneMatchKickoffOg(match.kickoff_time) : ''
  const title = `${home_team} vs ${away_team}`
  const description = formatted_time
    ? `Kickoff: ${formatted_time}. Predict the winner and margin with NextPlay Predictor.`
    : 'Predict the winner and margin. Lock in your pick with NextPlay Predictor.'

  const ogImageUrl = absoluteOneMatchOgImageUrl(trimmed)
  const pageUrl = absoluteOneMatchChallengeUrl(trimmed)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'NextPlay Predictor',
      type: 'website',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
          type: 'image/png',
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
