export type SoccerScoringRule = {
  points: number
  title: string
  description: string
  /** Extra line for knockout penalty clarification (3-point tier). */
  penaltyNote?: string
  examples?: string[]
}

export const SOCCER_SCORING_RULES: SoccerScoringRule[] = [
  {
    points: 3,
    title: 'Exact score',
    description: 'Your predicted scoreline matches the actual result exactly.',
    penaltyNote:
      'For knockout draws decided on penalties: you only get 3 points if you predicted the exact draw score and the correct penalty winner.',
    examples: [
      'Prediction 2–1, actual 2–1.',
      'Prediction 1–1 and Morocco on penalties. Actual 1–1 and Morocco wins on penalties.',
    ],
  },
  {
    points: 2,
    title: 'Correct result / advancing team + close score',
    description:
      'You predicted the correct result or advancing team, but the score was not exact.',
    examples: [
      'Prediction 2–2 and Morocco on penalties. Actual 1–1 and Morocco wins on penalties.',
      'Prediction 2–1, actual 1–0.',
      'Legacy prediction 1–1 before penalty picks were available. Actual 1–1 and Morocco wins on penalties.',
    ],
  },
  {
    points: 1,
    title: 'Partly correct',
    description:
      'You got part of the prediction right, but not enough for 2 or 3 points.',
    examples: [
      'Prediction 1–1 and Netherlands on penalties. Actual 1–1 and Morocco wins on penalties.',
      'One team score is correct, but the result/advancing team is wrong.',
    ],
  },
  {
    points: 0,
    title: 'Wrong result',
    description: 'You predicted the wrong result or advancing team.',
    examples: ['Prediction 3–0, actual 2–2 with the other team winning on penalties.'],
  },
]

export const SOCCER_PENALTY_KNOCKOUT_NOTE =
  'In knockout games, a draw prediction may require you to choose who wins on penalties.'

export const SOCCER_SCORING_LEADERBOARD_NOTE =
  'Leaderboards are updated after completed fixtures are scored.'

export const SOCCER_SCORING_TOOLTIP_SUMMARY =
  'Max 3 points per match: exact score (or exact draw + correct penalty winner in knockouts), 2 correct advancing team + close score, 1 partly correct, 0 wrong result.'
