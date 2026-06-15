'use client'

import LetterAvatar from '@/components/LetterAvatar'
import CommunityMarginDistributionChart from '@/components/community-predictor/CommunityMarginDistributionChart'
import SoccerCommunityPredictionPanel from '@/components/community-predictor/SoccerCommunityPredictionPanel'
import { formatCommunityMatchScheduleLine, type CommunityStatsOk } from '@/lib/community-predictor'
import CompetitionTeamLogo from '@/components/CompetitionTeamLogo'

function formatPctLabel(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

type ViewerAvatar = {
  displayName: string
  avatarUrl: string | null
  avatarLetter: string | null
  avatarColour: string | null
}

export default function CommunityDistributionPanel({
  stats,
  viewerAvatar,
  competitionSlug,
}: {
  stats: CommunityStatsOk
  viewerAvatar: ViewerAvatar | null
  competitionSlug?: string | null
}) {
  const yours =
    stats.scoring_mode === 'soccer_exact_score'
      ? stats.user_locked_home_score != null && stats.user_locked_away_score != null
        ? `${stats.home_team} ${stats.user_locked_home_score} - ${stats.user_locked_away_score} ${stats.away_team}`
        : null
      : stats.user_locked_winner != null && stats.user_locked_margin != null
        ? `${stats.user_locked_winner === 'home' ? stats.home_team : stats.away_team} by ${stats.user_locked_margin}`
        : null

  const avgLine =
    stats.community_average_label != null
      ? `Community average: ${stats.community_average_label}`
      : 'Community average: —'

  const scheduleLine = formatCommunityMatchScheduleLine(stats.kickoff_time, stats.status)
  const scoresExist = stats.home_score != null && stats.away_score != null
  const scoreLine = scoresExist ? `${stats.home_score} - ${stats.away_score}` : null
  const actualLine =
    !scoresExist || stats.actual_winner == null
      ? null
      : stats.scoring_mode === 'soccer_exact_score'
        ? stats.actual_winner === 'draw'
          ? 'Actual: Draw'
          : `Actual: ${stats.home_score} - ${stats.away_score}`
        : stats.actual_winner === 'draw'
          ? 'Actual: Draw'
          : `Actual: ${stats.actual_winner === 'home' ? stats.home_team : stats.away_team} by ${stats.actual_margin ?? 0}`

  return (
    <div className="w-full max-w-full overflow-hidden rounded-3xl border border-gray-200 bg-white p-4 shadow-lg shadow-black/10 sm:p-8">
      <div className="border-b border-gray-100">
        <div className="mb-8 grid w-full grid-cols-3 items-center px-2 sm:px-6">
          <div className="flex min-w-0 flex-col items-end text-right">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
              <CompetitionTeamLogo
                competitionSlug={competitionSlug}
                teamName={stats.home_team}
                size={80}
                variant="crest"
                className="h-full w-full"
              />
            </div>
            <div className="mt-2 line-clamp-2 font-semibold text-gray-900">{stats.home_team}</div>
            <div className="text-sm tracking-wide text-gray-500">HOME</div>
          </div>

          <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1 text-center sm:min-h-[5rem]">
            {scheduleLine ? (
              <div className="max-w-[15rem] px-1 text-[11px] font-semibold leading-tight text-gray-600 sm:text-xs">
                {scheduleLine}
              </div>
            ) : null}
            {scoreLine ? (
              <div className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">{scoreLine}</div>
            ) : (
              <div className="text-xs tracking-widest text-gray-400">VS</div>
            )}
          </div>

          <div className="flex min-w-0 flex-col items-start text-left">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
              <CompetitionTeamLogo
                competitionSlug={competitionSlug}
                teamName={stats.away_team}
                size={80}
                variant="crest"
                className="h-full w-full"
              />
            </div>
            <div className="mt-2 line-clamp-2 font-semibold text-gray-900">{stats.away_team}</div>
            <div className="text-sm tracking-wide text-red-500">AWAY</div>
          </div>
        </div>
      </div>

      {stats.scoring_mode === 'rugby_margin' ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-gray-700 sm:text-sm">
          <span className="rounded-full bg-gray-900 px-3 py-1 font-semibold text-white">
            Home {formatPctLabel(stats.home_prediction_pct)}%
          </span>
          <span className="rounded-full bg-red-700 px-3 py-1 font-semibold text-white">
            Away {formatPctLabel(stats.away_prediction_pct)}%
          </span>
        </div>
      ) : null}
      {yours && viewerAvatar ? (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-800">
          <LetterAvatar
            letter={viewerAvatar.avatarLetter}
            colour={viewerAvatar.avatarColour}
            avatarUrl={viewerAvatar.avatarUrl}
            displayName={viewerAvatar.displayName}
            name={viewerAvatar.displayName}
            size={22}
            className="ring-1 ring-gray-300 shadow-sm"
          />
          <span>
            You picked: <strong>{yours}</strong>
          </span>
        </div>
      ) : null}

      {stats.scoring_mode === 'rugby_margin' ? (
        <p className="mt-6 text-center text-sm font-semibold text-gray-900">{avgLine}</p>
      ) : null}
      {actualLine || (yours && viewerAvatar) ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold text-gray-900">
          {actualLine ? (
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-4 w-4 rounded-full bg-green-600" aria-hidden />
              <span>Actual</span>
            </div>
          ) : null}
          {yours && viewerAvatar ? (
            <div className="inline-flex items-center gap-2">
              <LetterAvatar
                letter={viewerAvatar.avatarLetter}
                colour={viewerAvatar.avatarColour}
                avatarUrl={viewerAvatar.avatarUrl}
                displayName={viewerAvatar.displayName}
                name={viewerAvatar.displayName}
                size={18}
                className="ring-1 ring-gray-300"
              />
              <span>You</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {stats.scoring_mode === 'soccer_exact_score' ? (
        <SoccerCommunityPredictionPanel stats={stats} />
      ) : (
        <CommunityMarginDistributionChart stats={stats} viewerAvatar={viewerAvatar} predictorAppPick={null} />
      )}
    </div>
  )
}
