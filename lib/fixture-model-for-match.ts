import type { SupabaseClient } from '@supabase/supabase-js'
import { getConsistencyModelSettings, toStrongOpponentBoostParams } from '@/lib/consistency-model-settings'
import {
  PREDICTOR_MODEL_VERSION,
  predictFixtureFullResult,
  type Match as PredictorMatch,
  type Team as PredictorTeam,
  type TeamConsistencyRow,
} from '@/lib/prediction-model'
import { buildTeamAliasResolverMap, type TeamAliasDbRow } from '@/lib/team-aliases-db'
import { matchTeamName, type TeamRow } from '@/lib/team-name-match'

export type PredictorAppChartPick = {
  winner: 'home' | 'away'
  margin: number
  /** Tooltip / aria: Predictor App: Team by N */
  tooltipTitle: string
  modelVersion: string
}

/**
 * Runs the same fixture margin model as the admin fixture preview (client-side with Supabase reads).
 * Returns null if teams cannot be resolved or the graph has no paths.
 */
export async function fetchPredictorAppPickForFixture(
  supabase: SupabaseClient,
  params: { homeTeamName: string; awayTeamName: string; kickoffTime: string }
): Promise<PredictorAppChartPick | null> {
  const homeTeamName = params.homeTeamName.trim()
  const awayTeamName = params.awayTeamName.trim()
  const kickoffTime = params.kickoffTime.trim()
  if (!homeTeamName || !awayTeamName || !kickoffTime) return null

  const season = new Date(kickoffTime).getFullYear()
  const fixtureMs = new Date(kickoffTime).getTime()
  if (Number.isNaN(fixtureMs)) return null

  const [
    { data: teamRows, error: teamsErr },
    { data: aliasRows, error: aliasErr },
    { data: seasonMatchesRaw, error: matchesErr },
    { data: consistencyData, error: consistencyErr },
    consistencySettings,
  ] = await Promise.all([
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('team_aliases').select('*'),
    supabase
      .from('matches')
      .select('id, season, match_date, team_a_id, team_b_id, team_a_score, team_b_score')
      .eq('season', season),
    supabase
      .from('team_consistency')
      .select('team_id, adjusted_consistency, consistency_score, is_anchor, anchor_status')
      .eq('season', season),
    getConsistencyModelSettings(supabase, season),
  ])

  if (teamsErr || !teamRows?.length || matchesErr || consistencyErr || aliasErr) {
    return null
  }

  const teams = teamRows as TeamRow[]
  const aliasMap = buildTeamAliasResolverMap((aliasRows as TeamAliasDbRow[]) ?? [], teams)

  const homeRes = matchTeamName(homeTeamName, teams, aliasMap)
  const awayRes = matchTeamName(awayTeamName, teams, aliasMap)

  if (!homeRes.matchedTeamId || !awayRes.matchedTeamId || homeRes.matchedTeamId === awayRes.matchedTeamId) {
    return null
  }

  const allSeasonMatches = (seasonMatchesRaw ?? []) as PredictorMatch[]
  const beforeFixture = allSeasonMatches.filter((m) => new Date(m.match_date).getTime() < fixtureMs)

  const consistencyMap = new Map<number, TeamConsistencyRow>()
  for (const row of (consistencyData || []) as TeamConsistencyRow[]) {
    consistencyMap.set(row.team_id, row)
  }

  const boostParams = toStrongOpponentBoostParams(consistencySettings)
  const predictorTeams: PredictorTeam[] = teams.map((t) => ({ id: t.id, name: t.name }))

  const full = predictFixtureFullResult(
    homeRes.matchedTeamId,
    awayRes.matchedTeamId,
    beforeFixture,
    predictorTeams,
    consistencyMap,
    boostParams
  )

  if (!full.ok) return null

  const avg = Math.round(full.result.averageMargin)
  const teamHome = homeTeamName
  const teamAway = awayTeamName

  if (avg > 0) {
    const margin = Math.max(1, Math.abs(avg))
    return {
      winner: 'home',
      margin,
      tooltipTitle: `Predictor App: ${teamHome} by ${margin}`,
      modelVersion: PREDICTOR_MODEL_VERSION,
    }
  }
  if (avg < 0) {
    const margin = Math.max(1, Math.abs(avg))
    return {
      winner: 'away',
      margin,
      tooltipTitle: `Predictor App: ${teamAway} by ${margin}`,
      modelVersion: PREDICTOR_MODEL_VERSION,
    }
  }

  return null
}
