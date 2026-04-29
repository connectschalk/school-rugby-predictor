/** Monday–Sunday week in Africa/Johannesburg (SAST, UTC+2, no DST). */

const TZ = 'Africa/Johannesburg'

function parseYmdInJohannesburg(isoInstant: Date): { y: number; m: number; d: number } {
  const s = isoInstant.toLocaleString('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, m, d] = s.split('-').map((x) => Number(x))
  return { y, m, d }
}

function weekdayIndexMonday0(isoInstant: Date): number {
  const wd = isoInstant.toLocaleString('en-US', { timeZone: TZ, weekday: 'short' })
  const key = wd.replace(/\.$/, '').slice(0, 3)
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  return map[key] ?? 0
}

/** SAST local midnight as UTC Date (fixed +2 offset). */
function sastMidnightUtc(y: number, month: number, day: number): Date {
  return new Date(Date.UTC(y, month - 1, day, -2, 0, 0, 0))
}

/** Calendar day-of-month for Monday of the week containing (y,m,d) in Johannesburg. */
function mondayDayOfMonth(y: number, m: number, d: number, dowMon0Sun6: number): { y: number; m: number; day: number } {
  let jd = d - dowMon0Sun6
  let jm = m
  let jy = y
  while (jd < 1) {
    jm -= 1
    if (jm < 1) {
      jm = 12
      jy -= 1
    }
    const dim = new Date(Date.UTC(jy, jm, 0)).getUTCDate()
    jd += dim
  }
  return { y: jy, m: jm, day: jd }
}

/** Start of Monday 00:00 SAST and end of Sunday 23:59:59.999 SAST for the week containing `reference`. */
export function getJohannesburgWeekBounds(reference: Date): { weekStart: Date; weekEnd: Date } {
  const { y, m, d } = parseYmdInJohannesburg(reference)
  const anchorUtcNoon = new Date(Date.UTC(y, m - 1, d, 10, 0, 0))
  const dow = weekdayIndexMonday0(anchorUtcNoon)
  const mon = mondayDayOfMonth(y, m, d, dow)
  const start = sastMidnightUtc(mon.y, mon.m, mon.day)
  const end = new Date(sastMidnightUtc(mon.y, mon.m, mon.day + 7))
  end.setMilliseconds(end.getMilliseconds() - 1)
  return { weekStart: start, weekEnd: end }
}

export function isKickoffInJohannesburgWeek(kickoffIso: string, reference: Date): boolean {
  const t = new Date(kickoffIso).getTime()
  if (Number.isNaN(t)) return false
  const { weekStart, weekEnd } = getJohannesburgWeekBounds(reference)
  return t >= weekStart.getTime() && t <= weekEnd.getTime()
}
