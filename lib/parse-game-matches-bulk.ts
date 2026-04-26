const KICKOFF_RE = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/

const MONTH_ABBR: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

export type ParsedGameLine =
  | {
      lineNumber: number
      raw: string
      ok: true
      home_team: string
      away_team: string
      kickoff_time: string
      /** Original date cell when using Date,Home Team,Away Team CSV */
      raw_date?: string
    }
  | { lineNumber: number; raw: string; ok: false; error: string }

/**
 * Next Saturday at 15:00 in the browser/server local timezone.
 * If today is Saturday and the current time is before 15:00, uses today.
 * If today is Saturday at or after 15:00, uses the following Saturday.
 */
export function getDefaultKickoffNextSaturday15Local(now: Date = new Date()): string {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = now.getDay()
  let addDays: number
  if (day === 6) {
    const sat1500 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0, 0, 0)
    addDays = now < sat1500 ? 0 : 7
  } else {
    addDays = (6 - day + 7) % 7
  }
  base.setDate(base.getDate() + addDays)
  base.setHours(15, 0, 0, 0)
  return base.toISOString()
}

/** RFC4180-ish: commas inside double quotes, escaped quotes as "" */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === ',' && !inQuotes) {
      out.push(cur.trim())
      cur = ''
    } else if (c !== '\r') {
      cur += c
    }
  }
  out.push(cur.trim())
  return out
}

function parseKickoffLocal(str: string): { ok: true; iso: string } | { ok: false; error: string } {
  const s = str.trim()
  const m = s.match(KICKOFF_RE)
  if (!m) {
    return {
      ok: false,
      error: 'Kickoff must look like YYYY-MM-DD HH:mm (e.g. 2026-05-02 15:00)',
    }
  }
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const h = Number(m[4])
  const min = Number(m[5])
  const dt = new Date(y, mo - 1, d, h, min, 0, 0)
  if (Number.isNaN(dt.getTime())) {
    return { ok: false, error: 'Invalid calendar date or time' }
  }
  return { ok: true, iso: dt.toISOString() }
}

/**
 * Parses cells like Mon.27Apr, 27Apr, Mon 27 Apr (year = now or next if date looks past).
 * Default kickoff is 15:00 local on that day; optional CSV "Time" column overrides HH:mm on that day.
 */
export function parseFixtureDateCellToKickoff(
  cell: string,
  now: Date = new Date()
): { ok: true; iso: string } | { ok: false } {
  const s = cell.trim()
  if (!s) return { ok: false }
  // Mon.27Apr / Mon. 27 Apr / 27Apr / 27 Apr
  const m = s.match(/^(?:[a-z]{2,5}\.?\s*)?(\d{1,2})\s*([a-z]{3})\.?$/i)
  if (!m) return { ok: false }
  const dayNum = parseInt(m[1], 10)
  const monKey = m[2].toLowerCase().slice(0, 3)
  const monthIdx = MONTH_ABBR[monKey]
  if (monthIdx === undefined || !Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
    return { ok: false }
  }
  const y = now.getFullYear()
  let dt = new Date(y, monthIdx, dayNum, 15, 0, 0, 0)
  if (Number.isNaN(dt.getTime())) return { ok: false }
  const msWeek = 7 * 86400000
  if (dt.getTime() < now.getTime() - msWeek) {
    dt = new Date(y + 1, monthIdx, dayNum, 15, 0, 0, 0)
    if (Number.isNaN(dt.getTime())) return { ok: false }
  }
  return { ok: true, iso: dt.toISOString() }
}

/** Parse "15:00" or "9:30" for optional fixture Time column. */
function parseLocalTimeOfDayCell(cell: string): { hour: number; minute: number } | null {
  const m = cell.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const hour = parseInt(m[1], 10)
  const minute = parseInt(m[2], 10)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

function splitVsSides(line: string): { home: string; away: string } | null {
  const m = line.match(/^(.+?)\s+vs\s+(.+)$/i)
  if (!m) return null
  const home = m[1].trim()
  const away = m[2].trim()
  if (!home || !away) return null
  return { home, away }
}

function okRow(
  lineNumber: number,
  raw: string,
  home_team: string,
  away_team: string,
  kickoff_time: string,
  raw_date?: string
): ParsedGameLine {
  return {
    lineNumber,
    raw,
    ok: true,
    home_team,
    away_team,
    kickoff_time,
    raw_date,
  }
}

/** Pipe: optional kickoff after `|`; empty right side → default Saturday 15:00. */
function parsePipeFormat(line: string, lineNumber: number, now: Date): ParsedGameLine {
  const pipeIdx = line.indexOf('|')
  const left = line.slice(0, pipeIdx).trim()
  const datetimePart = line.slice(pipeIdx + 1).trim()
  const vs = splitVsSides(left)
  if (!vs) {
    return {
      lineNumber,
      raw: line,
      ok: false,
      error: 'Left of "|" must be "Home vs Away" (use " vs " between teams)',
    }
  }
  if (!datetimePart) {
    return okRow(lineNumber, line, vs.home, vs.away, getDefaultKickoffNextSaturday15Local(now))
  }
  const k = parseKickoffLocal(datetimePart)
  if (!k.ok) {
    return { lineNumber, raw: line, ok: false, error: k.error }
  }
  return okRow(lineNumber, line, vs.home, vs.away, k.iso)
}

function normHeaderCell(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/_/g, ' ')
}

function isOptionalFixtureTimeHeaderCell(parts: string[], index: number): boolean {
  const c = normHeaderCell(parts[index] ?? '')
  if (!c) return true
  return (
    c === 'time' ||
    c === 'kickoff time' ||
    c === 'kickoff' ||
    c === 'cutoff time' ||
    c === 'cutoff' ||
    c === 'prediction cutoff' ||
    c === 'prediction cutoff time'
  )
}

/** Date,Home Team,Away Team[, Time] (spacing/case flexible; legacy cutoff headers accepted) */
export function isFixtureCsvHeaderRow(parts: string[]): boolean {
  if (parts.length < 3) return false
  const d = normHeaderCell(parts[0])
  const h = normHeaderCell(parts[1])
  const a = normHeaderCell(parts[2])
  if (d !== 'date' || h !== 'home team' || a !== 'away team') return false
  if (parts.length >= 4 && !isOptionalFixtureTimeHeaderCell(parts, 3)) return false
  return true
}

/** Comma body: two teams only, or teams + optional kickoff in remaining columns. */
function parseCommaBody(line: string, lineNumber: number, parts: string[], now: Date): ParsedGameLine {
  if (parts.length < 2) {
    return {
      lineNumber,
      raw: line,
      ok: false,
      error: 'Need at least two columns: Home, Away',
    }
  }
  const home_team = parts[0]
  const away_team = parts[1]
  if (!home_team || !away_team) {
    return { lineNumber, raw: line, ok: false, error: 'Home and away team names cannot be empty' }
  }
  if (parts.length === 2) {
    return okRow(lineNumber, line, home_team, away_team, getDefaultKickoffNextSaturday15Local(now))
  }
  const datetimePart = parts.slice(2).join(', ')
  const k = parseKickoffLocal(datetimePart)
  if (!k.ok) {
    return { lineNumber, raw: line, ok: false, error: k.error }
  }
  return okRow(lineNumber, line, home_team, away_team, k.iso)
}

/**
 * Three columns: either Date,Home,Away (fixture) or Home,Away,kickoff (legacy CSV third col).
 * Fixture mode if: explicit fixture header row was seen, OR col0 parses as fixture date, OR col0 empty.
 */
function parseThreeColumnCsvRow(
  line: string,
  lineNumber: number,
  parts: string[],
  fixtureMode: boolean,
  now: Date
): ParsedGameLine {
  const c0 = parts[0]?.trim() ?? ''
  const c1 = parts[1]?.trim() ?? ''
  const c2 = parts[2]?.trim() ?? ''
  if (!c1 || !c2) {
    return { lineNumber, raw: line, ok: false, error: 'Home and away team names cannot be empty' }
  }

  const kickTry = parseKickoffLocal(parts.slice(2).join(', '))
  const dateTry = c0 ? parseFixtureDateCellToKickoff(c0, now) : { ok: false as const }

  if (fixtureMode || dateTry.ok || c0 === '') {
    const raw_date = c0 || undefined
    let kick = getDefaultKickoffNextSaturday15Local(now)
    if (dateTry.ok) {
      kick = dateTry.iso
    }
    const timeCell = parts.length >= 4 ? parts[3]?.trim() : undefined
    if (timeCell) {
      const parsed = parseLocalTimeOfDayCell(timeCell)
      if (!parsed) {
        return {
          lineNumber,
          raw: line,
          ok: false,
          error: 'Time column must look like 15:00 (hour:minute, 24h)',
        }
      }
      const base = new Date(kick)
      if (Number.isNaN(base.getTime())) {
        return { lineNumber, raw: line, ok: false, error: 'Invalid kickoff date for time column' }
      }
      kick = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        parsed.hour,
        parsed.minute,
        0,
        0
      ).toISOString()
    }
    return okRow(lineNumber, line, c1, c2, kick, raw_date)
  }

  if (kickTry.ok) {
    return okRow(lineNumber, line, c0, c1, kickTry.iso)
  }

  return {
    lineNumber,
    raw: line,
    ok: false,
    error:
      'Ambiguous 3-column row: use header Date,Home Team,Away Team, or home_team,away_team,kickoff_time (YYYY-MM-DD HH:mm), or put a parseable date in the first column',
  }
}

/** `Home vs Away` only — default kickoff. */
function parseVsOnly(line: string, lineNumber: number, now: Date): ParsedGameLine {
  const vs = splitVsSides(line)
  if (!vs) {
    return {
      lineNumber,
      raw: line,
      ok: false,
      error: 'Use "Home vs Away" or "Home, Away"',
    }
  }
  return okRow(lineNumber, line, vs.home, vs.away, getDefaultKickoffNextSaturday15Local(now))
}

function parseCommaOrFixtureLine(line: string, lineNumber: number, now: Date): ParsedGameLine {
  const parts = splitCsvLine(line)
  if (parts.length >= 3) {
    return parseThreeColumnCsvRow(line, lineNumber, parts, false, now)
  }
  return parseCommaBody(line, lineNumber, parts, now)
}

/**
 * One non-empty textarea line: vs-only, comma (2 or 3+ cols), or vs + optional `| kickoff`.
 */
export function parseGameMatchLine(line: string, lineNumber: number, now: Date = new Date()): ParsedGameLine {
  const trimmed = line.trim()
  if (!trimmed) {
    return { lineNumber, raw: line, ok: false, error: 'Empty line' }
  }

  if (trimmed.includes('|')) {
    return parsePipeFormat(trimmed, lineNumber, now)
  }

  if (trimmed.includes(',')) {
    return parseCommaOrFixtureLine(trimmed, lineNumber, now)
  }

  if (/\bvs\b/i.test(trimmed)) {
    return parseVsOnly(trimmed, lineNumber, now)
  }

  return {
    lineNumber,
    raw: line,
    ok: false,
    error: 'Use "Home vs Away" or "Home, Away" (optional: "| YYYY-MM-DD HH:mm" or third CSV column)',
  }
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function headerKeySnake(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isSnakeCaseHomeAwayHeader(parts: string[]): boolean {
  if (parts.length < 2) return false
  const a = headerKeySnake(parts[0])
  const b = headerKeySnake(parts[1])
  return a === 'home_team' && b === 'away_team'
}

/** e.g. Home Team, Away Team (no Date column) */
function isPlainTwoColTeamHeader(parts: string[]): boolean {
  if (parts.length < 2) return false
  const a = normHeaderCell(parts[0])
  const b = normHeaderCell(parts[1])
  return (
    (a === 'home team' || a === 'home') &&
    (b === 'away team' || b === 'away')
  )
}

/** Parse CSV text: legacy headers, fixture Date,Home,Away, optional kickoff column. */
export function parseGameMatchesCsv(csvText: string, now: Date = new Date()): ParsedGameLine[] {
  const text = stripBom(csvText)
  const lines = text.split(/\r?\n/)
  const out: ParsedGameLine[] = []
  let sawAnyHeader = false
  let fixtureMode = false

  for (let i = 0; i < lines.length; i += 1) {
    const physicalLine = i + 1
    const rawLine = lines[i]
    if (!rawLine.trim()) continue

    const parts = splitCsvLine(rawLine)

    if (!sawAnyHeader && isFixtureCsvHeaderRow(parts)) {
      sawAnyHeader = true
      fixtureMode = true
      continue
    }

    if (!sawAnyHeader && (isSnakeCaseHomeAwayHeader(parts) || isPlainTwoColTeamHeader(parts))) {
      sawAnyHeader = true
      fixtureMode = false
      continue
    }

    if (parts.length < 2) {
      out.push({
        lineNumber: physicalLine,
        raw: rawLine,
        ok: false,
        error: 'CSV row needs at least two columns',
      })
      continue
    }

    if (isFixtureCsvHeaderRow(parts) || isSnakeCaseHomeAwayHeader(parts) || isPlainTwoColTeamHeader(parts)) {
      out.push({
        lineNumber: physicalLine,
        raw: rawLine,
        ok: false,
        error: 'Header row must be the first non-empty line',
      })
      continue
    }

    const home_team = parts[0]
    const away_team = parts[1]
    if (!home_team || !away_team) {
      out.push({
        lineNumber: physicalLine,
        raw: rawLine,
        ok: false,
        error: 'Home and away team names cannot be empty',
      })
      continue
    }

    if (parts.length >= 3) {
      out.push(parseThreeColumnCsvRow(rawLine, physicalLine, parts, fixtureMode, now))
      continue
    }

    if (parts.length === 2) {
      out.push(
        okRow(physicalLine, rawLine, home_team, away_team, getDefaultKickoffNextSaturday15Local(now))
      )
    }
  }

  return out
}

/**
 * Textarea bulk: if the first non-empty line is a fixture CSV header, parse remaining lines as fixture rows.
 * Otherwise line-by-line using parseGameMatchLine.
 */
export function parseGameMatchesBulk(text: string, now: Date = new Date()): ParsedGameLine[] {
  const lines = text.split(/\r?\n/)
  const nonempty = lines
    .map((l, i) => ({ l, lineNumber: i + 1 }))
    .filter(({ l }) => l.trim())
  if (nonempty.length === 0) return []

  const firstParts = splitCsvLine(nonempty[0].l)
  if (isFixtureCsvHeaderRow(firstParts)) {
    const out: ParsedGameLine[] = []
    for (let i = 1; i < nonempty.length; i += 1) {
      const { l, lineNumber } = nonempty[i]
      const parts = splitCsvLine(l)
      if (parts.length < 3) {
        out.push({
          lineNumber,
          raw: l,
          ok: false,
          error: 'Fixture CSV rows need at least Date, Home Team, Away Team',
        })
        continue
      }
      out.push(parseThreeColumnCsvRow(l, lineNumber, parts, true, now))
    }
    return out
  }

  const out: ParsedGameLine[] = []
  let n = 0
  for (const line of lines) {
    n += 1
    if (!line.trim()) continue
    out.push(parseGameMatchLine(line, n, now))
  }
  return out
}