/**
 * NextPlay fixture kickoffs: naive admin/import times are Africa/Johannesburg (SAST, UTC+2).
 * Database stores timestamptz (UTC). UI datetime-local shows Johannesburg wall clock.
 */

export const NEXTPLAY_FIXTURE_TIMEZONE = 'Africa/Johannesburg'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function johannesburgParts(d: Date): {
  year: string
  month: string
  day: string
  hour: string
  minute: string
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NEXTPLAY_FIXTURE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour').padStart(2, '0'),
    minute: get('minute'),
  }
}

/** UTC ISO → value for `<input type="datetime-local">` in Johannesburg. */
export function toAdminJohannesburgInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = johannesburgParts(d)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/** datetime-local value (Johannesburg wall clock) → UTC ISO for storage. */
export function fromAdminJohannesburgInput(v: string): string | null {
  const t = v.trim()
  if (!t) return null
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const hh = Number(m[4])
  const mm = Number(m[5])
  if (![y, mo, d, hh, mm].every(Number.isFinite)) return null
  const utc = new Date(Date.UTC(y, mo - 1, d, hh - 2, mm, 0, 0))
  if (Number.isNaN(utc.getTime())) return null
  return utc.toISOString()
}

/** Format an instant as `YYYY-MM-DD HH:mm` in Johannesburg (import preview / XLSX cells). */
export function formatInstantAsJohannesburgWallClock(d: Date): string {
  if (Number.isNaN(d.getTime())) return ''
  const p = johannesburgParts(d)
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

/**
 * Parse naive kickoff strings as Johannesburg local time.
 * Values with Z or explicit offset are treated as absolute instants.
 */
export function parseJohannesburgKickoff(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString()
  }

  const dtLocal = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})$/)
  if (dtLocal) return fromAdminJohannesburgInput(trimmed)

  const isoLocal = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/)
  if (isoLocal) {
    return fromAdminJohannesburgInput(
      `${isoLocal[1]}-${isoLocal[2]}-${isoLocal[3]}T${pad2(Number(isoLocal[4]))}:${isoLocal[5]}`
    )
  }

  const dmy = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[T\s]+(\d{1,2}):(\d{2}))?$/)
  if (dmy) {
    const day = Number(dmy[1])
    const mo = Number(dmy[2])
    const y = Number(dmy[3])
    const hh = dmy[4] != null ? Number(dmy[4]) : 15
    const mm = dmy[5] != null ? Number(dmy[5]) : 0
    return fromAdminJohannesburgInput(
      `${y}-${pad2(mo)}-${pad2(day)}T${pad2(hh)}:${pad2(mm)}`
    )
  }

  const ymdOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymdOnly) {
    return fromAdminJohannesburgInput(`${ymdOnly[1]}-${ymdOnly[2]}-${ymdOnly[3]}T15:00`)
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

/** Public/admin list display — always Africa/Johannesburg. */
export function formatKickoffJohannesburg(
  iso: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-ZA', {
    timeZone: NEXTPLAY_FIXTURE_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options,
  })
}

export function isKickoffTodayJohannesburg(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const fmt = (instant: Date) =>
    instant.toLocaleDateString('en-CA', { timeZone: NEXTPLAY_FIXTURE_TIMEZONE })
  return fmt(d) === fmt(now)
}
