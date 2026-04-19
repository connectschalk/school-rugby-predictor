'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'
import {
  type Team,
  type Match,
  type PathResult,
  type PredictionResult,
  type TeamConsistencyRow,
  MAX_LINKS,
  HOME_ADVANTAGE,
  buildGraph,
  calculateTeamConsistency,
  computeSeasonStrengthRatings,
  findAllPathsWithWeights,
  getConfidence,
  getMatchSummary,
  formatFixture,
} from '@/lib/prediction-model'

export default function PredictorPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [season, setSeason] = useState('2026')
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [location, setLocation] = useState('neutral')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [teamConsistencyByTeamId, setTeamConsistencyByTeamId] = useState<
    Map<number, TeamConsistencyRow>
  >(new Map())

  useEffect(() => {
    trackEvent('page_view', 'predictor')
  }, [])

  useEffect(() => {
    async function loadTeams() {
      const { data } = await supabase
        .from('teams')
        .select('id, name')
        .order('name')

      setTeams((data as Team[]) || [])
    }

    loadTeams()
  }, [])

  useEffect(() => {
    async function loadMatches() {
      setLoading(true)
      setError('')
      setResult(null)

      const { data, error } = await supabase
        .from('matches')
        .select('id, season, match_date, team_a_id, team_b_id, team_a_score, team_b_score')
        .eq('season', Number(season))
        .order('match_date', { ascending: false })

      if (error) {
        setError(error.message)
        setMatches([])
      } else {
        setMatches((data as Match[]) || [])
      }

      setLoading(false)
    }

    loadMatches()
  }, [season])

  useEffect(() => {
    async function loadTeamConsistency() {
      const { data, error } = await supabase
        .from('team_consistency')
        .select('team_id, adjusted_consistency, consistency_score, is_anchor, anchor_status')
        .eq('season', Number(season))

      if (error) {
        setTeamConsistencyByTeamId(new Map())
        return
      }

      const map = new Map<number, TeamConsistencyRow>()
      for (const row of (data as TeamConsistencyRow[]) || []) {
        map.set(row.team_id, row)
      }
      setTeamConsistencyByTeamId(map)
    }

    loadTeamConsistency()
  }, [season])

  const graph = useMemo(() => buildGraph(matches), [matches])

  const matchesById = useMemo(() => {
    const map: Record<number, Match> = {}
    for (const match of matches) {
      map[match.id] = match
    }
    return map
  }, [matches])

  const volatilityConsistencyMap = useMemo(() => calculateTeamConsistency(matches), [matches])

  const strengthMap = useMemo(() => computeSeasonStrengthRatings(matches), [matches])

  const homeTeamName = teams.find((t) => String(t.id) === homeTeam)?.name || 'Unknown team'
  const awayTeamName = teams.find((t) => String(t.id) === awayTeam)?.name || 'Unknown team'

  async function runPrediction() {
    setError('')
    setResult(null)

    if (!homeTeam || !awayTeam) {
      setError('Please choose two teams.')
      await trackEvent('prediction_error', 'predictor', {
        reason: 'missing_team_selection',
        season,
      })
      return
    }

    if (homeTeam === awayTeam) {
      setError('Please choose two different teams.')
      await trackEvent('prediction_error', 'predictor', {
        reason: 'same_team_selected',
        season,
        homeTeam,
        awayTeam,
      })
      return
    }

    const directMatch = matches.find(
      (m) =>
        (String(m.team_a_id) === homeTeam && String(m.team_b_id) === awayTeam) ||
        (String(m.team_a_id) === awayTeam && String(m.team_b_id) === homeTeam)
    )

    if (directMatch) {
      const margin =
        String(directMatch.team_a_id) === homeTeam
          ? directMatch.team_a_score - directMatch.team_b_score
          : directMatch.team_b_score - directMatch.team_a_score

      const directResult: PredictionResult = {
        type: 'direct',
        averageMargin: margin,
        pathCount: 1,
        confidence: 'High',
        paths: [],
        directMatch,
        relevantMatches: [directMatch],
      }

      setResult(directResult)

      await trackEvent('prediction_run', 'predictor', {
        season,
        homeTeamId: homeTeam,
        awayTeamId: awayTeam,
        homeTeamName,
        awayTeamName,
        resultType: 'direct',
        confidence: 'High',
        averageMargin: margin,
        linksUsed: 1,
        relevantMatches: 1,
      })

      return
    }

    const allPaths = findAllPathsWithWeights(
      graph,
      homeTeam,
      awayTeam,
      MAX_LINKS,
      teams,
      volatilityConsistencyMap,
      strengthMap,
      teamConsistencyByTeamId
    )

    if (allPaths.length === 0) {
      setError('Not enough data.')
      await trackEvent('prediction_error', 'predictor', {
        reason: 'not_enough_data',
        season,
        homeTeamId: homeTeam,
        awayTeamId: awayTeam,
        homeTeamName,
        awayTeamName,
      })
      return
    }

    const weightedTotal = allPaths.reduce((sum, p) => sum + p.totalMargin * p.weight, 0)
    const totalWeight = allPaths.reduce((sum, p) => sum + p.weight, 0)
    const weightedAverage = weightedTotal / totalWeight

    const sortedPaths = [...allPaths].sort((a, b) => b.weight - a.weight)
    const topPathsToShow = sortedPaths.slice(0, 10)

    const relevantMatchIds = Array.from(
      new Set(topPathsToShow.flatMap((path) => path.path.map((edge) => edge.matchId)))
    )

    const relevantMatches = relevantMatchIds
      .map((id) => matchesById[id])
      .filter(Boolean)

    const confidence = getConfidence('indirect', allPaths.length, totalWeight)

    const indirectResult: PredictionResult = {
      type: 'indirect',
      averageMargin: weightedAverage,
      pathCount: allPaths.length,
      confidence,
      paths: topPathsToShow,
      relevantMatches,
    }

    setResult(indirectResult)

    await trackEvent('prediction_run', 'predictor', {
      season,
      homeTeamId: homeTeam,
      awayTeamId: awayTeam,
      homeTeamName,
      awayTeamName,
      resultType: 'indirect',
      confidence,
      averageMargin: indirectResult.averageMargin,
      linksUsed: allPaths.length,
      shownPaths: topPathsToShow.length,
      relevantMatches: relevantMatches.length,
    })
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold">School Rugby Predictor</h1>
        <p className="mt-2 text-gray-600">
          Choose two teams and get a projected margin based on linked match results. Indirect paths use
          dampened margins, opponent strength, and trust weights so blowouts against weak teams matter
          less than performance against strong opponents.
        </p>

        <div className="mt-6 max-w-xs">
          <label className="mb-2 block text-sm font-medium">Season</label>
          <input
            type="number"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </div>

        <div className="mt-8 rounded-2xl border border-gray-200 p-6 shadow-sm">
          {loading ? (
            <p>Loading teams and matches...</p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">Home Team</label>
                  <select
                    value={homeTeam}
                    onChange={(e) => setHomeTeam(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  >
                    <option value="">Choose Home Team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Away Team</label>
                  <select
                    value={awayTeam}
                    onChange={(e) => setAwayTeam(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  >
                    <option value="">Choose Away Team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium">Match Location</label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                >
                  <option value="neutral">Neutral</option>
                  <option value="home">Home team at home</option>
                  <option value="away">Away team at home</option>
                </select>
              </div>

              <button
                onClick={runPrediction}
                className="mt-5 rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
              >
                Predict Margin
              </button>

              {error && (
                <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                  {error}
                </div>
              )}

              {result && (
                <div className="mt-6 space-y-6">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                    <h2 className="text-xl font-semibold">
                      {result.type === 'direct' ? 'Direct Result Found' : 'Indirect Prediction'}
                    </h2>

                    <p className="mt-3 text-lg">
                      {Math.round(result.averageMargin) > 0
                        ? `${homeTeamName} by ${Math.round(Math.abs(result.averageMargin))}`
                        : Math.round(result.averageMargin) < 0
                          ? `${awayTeamName} by ${Math.round(Math.abs(result.averageMargin))}`
                          : 'Projected draw'}
                    </p>

                    {location !== 'neutral' && (
                      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700">
                        <p>
                          Home-field context:{' '}
                          {location === 'home'
                            ? `${homeTeamName} at home may add about ${HOME_ADVANTAGE} points`
                            : `${awayTeamName} at home may add about ${HOME_ADVANTAGE} points`}
                        </p>

                        <p className="mt-2 font-medium">
                          Expected match range:{' '}
                          {(() => {
                            const base = result.averageMargin

                            if (base === 0) {
                              return location === 'home'
                                ? `${homeTeamName} by 0 to ${HOME_ADVANTAGE}`
                                : `${awayTeamName} by 0 to ${HOME_ADVANTAGE}`
                            }

                            if (location === 'home') {
                              const low = base
                              const high = base + HOME_ADVANTAGE

                              if (high <= 0) {
                                return `${awayTeamName} by ${Math.abs(Math.round(high))} to ${Math.abs(
                                  Math.round(low)
                                )}`
                              }

                              if (low >= 0) {
                                return `${homeTeamName} by ${Math.round(low)} to ${Math.round(high)}`
                              }

                              return `${awayTeamName} by 0 to ${Math.abs(Math.round(low))}, or ${homeTeamName} by 0 to ${Math.round(
                                high
                              )}`
                            }

                            const low = base - HOME_ADVANTAGE
                            const high = base

                            if (high <= 0) {
                              return `${awayTeamName} by ${Math.abs(Math.round(high))} to ${Math.abs(
                                Math.round(low)
                              )}`
                            }

                            if (low >= 0) {
                              return `${homeTeamName} by ${Math.round(low)} to ${Math.round(high)}`
                            }

                            return `${awayTeamName} by 0 to ${Math.abs(Math.round(low))}, or ${homeTeamName} by 0 to ${Math.round(
                              high
                            )}`
                          })()}
                        </p>
                      </div>
                    )}

                    <p className="mt-2 text-sm text-gray-600">
                      Confidence: {result.confidence}
                    </p>

                    <p className="text-sm text-gray-600">
                      Links used: {result.pathCount}
                    </p>

                    {result.type === 'direct' && result.directMatch && (
                      <p className="text-sm text-gray-600">
                        Match date:{' '}
                        {new Date(result.directMatch.match_date).toLocaleDateString()}
                      </p>
                    )}

                    {result.type === 'indirect' && (
                      <p className="text-sm text-gray-600">
                        Based on {result.pathCount} total linked path(s), showing top 10 by weight
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold">Relevant Games</h3>

                    {result.relevantMatches.length === 0 ? (
                      <p className="mt-3 text-sm text-gray-600">No relevant games found.</p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {result.relevantMatches.map((match) => (
                          <div
                            key={match.id}
                            className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700"
                          >
                            {formatFixture(match, teams)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {result.type === 'indirect' && (
                    <div className="rounded-2xl border border-gray-200 p-6">
                      <h3 className="text-lg font-semibold">Motivation</h3>
                      <div className="mt-4 space-y-4">
                        {result.paths.map((pathResult: PathResult, index) => (
                          <div
                            key={index}
                            className="rounded-xl border border-gray-200 bg-white p-4"
                          >
                            <p className="font-medium">
                              Path {index + 1}:{' '}
                              {Math.round(pathResult.totalMargin) > 0
                                ? `${homeTeamName} by ${Math.round(Math.abs(pathResult.totalMargin))}`
                                : Math.round(pathResult.totalMargin) < 0
                                  ? `${awayTeamName} by ${Math.round(Math.abs(pathResult.totalMargin))}`
                                  : 'Draw'}
                            </p>

                            <p className="mt-1 text-sm text-gray-600">
                              Links: {pathResult.path.length} | Weight:{' '}
                              {pathResult.weight.toFixed(3)} | Baseline teams in path:{' '}
                              {pathResult.baselineCount} | Volatility factor:{' '}
                              {pathResult.consistencyScore.toFixed(3)} | Trust:{' '}
                              {pathResult.trustFactor.toFixed(3)} | Strong-opponent boost:{' '}
                              {pathResult.strongOpponentBoost.toFixed(3)}
                            </p>

                            <div className="mt-3 space-y-2 text-sm text-gray-700">
                              {pathResult.path.map((edge, edgeIndex) => {
                                const match = matchesById[edge.matchId]
                                if (!match) return null

                                return (
                                  <div key={edgeIndex} className="rounded-lg bg-gray-50 p-3">
                                    {getMatchSummary(match, edge.from, teams)}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
