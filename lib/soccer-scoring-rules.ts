export type SoccerScoringRule = {
  points: number
  title: string
  description: string
  example?: string
}

export const SOCCER_SCORING_RULES: SoccerScoringRule[] = [
  {
    points: 3,
    title: 'Exact score',
    description: 'Your predicted scoreline matches the actual result exactly.',
    example: 'Prediction 2-1, actual 2-1',
  },
  {
    points: 2,
    title: 'Correct result + close score',
    description:
      'You predicted the correct result: home win, away win, or draw. The score was close, but not exact.',
  },
  {
    points: 1,
    title: 'Correct result only',
    description:
      'You predicted the correct result, but the score was not close. This can include one correct team score.',
  },
  {
    points: 0,
    title: 'Wrong result',
    description: 'You predicted the wrong result.',
    example: 'Prediction 3-0, actual 2-2',
  },
]

export const SOCCER_SCORING_LEADERBOARD_NOTE =
  'Leaderboards are updated after completed fixtures are scored.'
