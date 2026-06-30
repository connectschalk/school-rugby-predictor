/** Whether a soccer fixture is a knockout round (penalties may decide the winner). */
export function isKnockoutSoccerFixture(fixtureRound: string | null | undefined): boolean {
  const r = (fixtureRound ?? '').trim().toLowerCase()
  if (!r) return false
  if (/^group\b/.test(r)) return false
  return /knockout|round of \d+|last \d+|quarter|semi-?final|final|play-?off|third place|last 16|last 32/.test(
    r
  )
}
