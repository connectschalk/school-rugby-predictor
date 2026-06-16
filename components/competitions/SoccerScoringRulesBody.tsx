import {
  SOCCER_SCORING_LEADERBOARD_NOTE,
  SOCCER_SCORING_RULES,
} from '@/lib/soccer-scoring-rules'

export default function SoccerScoringRulesBody() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-gray-800">
      <p className="font-semibold text-gray-900">Soccer scoring:</p>
      <ul className="space-y-4">
        {SOCCER_SCORING_RULES.map((rule) => (
          <li key={rule.points}>
            <p className="font-semibold text-gray-900">
              {rule.points} {rule.points === 1 ? 'point' : 'points'}: {rule.title}
            </p>
            <p className="mt-1 text-gray-700">{rule.description}</p>
            {rule.example ? (
              <p className="mt-1 text-xs text-gray-600">Example: {rule.example}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
        {SOCCER_SCORING_LEADERBOARD_NOTE}
      </p>
    </div>
  )
}
