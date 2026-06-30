import type { SoccerScoringRule } from '@/lib/soccer-scoring-rules'
import { SOCCER_SCORING_RULES } from '@/lib/soccer-scoring-rules'

function ExampleLines({ examples }: { examples: string[] }) {
  if (examples.length === 0) return null
  if (examples.length === 1) {
    return <p className="mt-1 text-xs text-gray-600">Example: {examples[0]}</p>
  }
  return (
    <div className="mt-1 text-xs text-gray-600">
      <p>Examples:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {examples.map((example) => (
          <li key={example}>{example}</li>
        ))}
      </ul>
    </div>
  )
}

function ScoringRuleItem({ rule }: { rule: SoccerScoringRule }) {
  return (
    <li>
      <p className="font-semibold text-gray-900">
        {rule.points} {rule.points === 1 ? 'point' : 'points'}: {rule.title}
      </p>
      <p className="mt-1 text-gray-700">{rule.description}</p>
      {rule.penaltyNote ? (
        <p className="mt-1 text-gray-700">{rule.penaltyNote}</p>
      ) : null}
      {rule.examples ? <ExampleLines examples={rule.examples} /> : null}
    </li>
  )
}

export function SoccerScoringRulesList({ className = 'space-y-4' }: { className?: string }) {
  return (
    <ul className={className}>
      {SOCCER_SCORING_RULES.map((rule) => (
        <ScoringRuleItem key={rule.points} rule={rule} />
      ))}
    </ul>
  )
}
