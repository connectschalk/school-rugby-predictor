import {
  SOCCER_PENALTY_KNOCKOUT_NOTE,
  SOCCER_SCORING_LEADERBOARD_NOTE,
} from '@/lib/soccer-scoring-rules'
import { SoccerScoringRulesList } from '@/components/competitions/SoccerScoringRulesList'

type Props = {
  showTitle?: boolean
  showLeaderboardNote?: boolean
}

export default function SoccerScoringRulesBody({
  showTitle = true,
  showLeaderboardNote = true,
}: Props) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-gray-800">
      {showTitle ? <p className="font-semibold text-gray-900">Soccer scoring:</p> : null}
      <SoccerScoringRulesList />
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-100">
        {SOCCER_PENALTY_KNOCKOUT_NOTE}
      </p>
      {showLeaderboardNote ? (
        <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {SOCCER_SCORING_LEADERBOARD_NOTE}
        </p>
      ) : null}
    </div>
  )
}
