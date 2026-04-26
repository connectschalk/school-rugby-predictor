const KICKOFF_RE = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/

export type ParsedGameLine =
  | {
      lineNumber: number
      raw: string
      ok: true
      home_team: string
      away_team: string
      kickoff_time: string
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
  kickoff_time: string
): ParsedGameLine {
  return { lineNumber, raw, ok: true, home_team, away_team, kickoff_time }
}

/** Pipe: optional kickoff after `|`; empty right side → default Saturday 15:00. */
function parsePipeFormat(line: string, lineNumber: number): ParsedGameLine {
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
    return okRow(lineNumber, line, vs.home, vs.away, getDefaultKickoffNextSaturday15Local())
  }
  const k = parseKickoffLocal(datetimePart)
  if (!k.ok) {
    return { lineNumber, raw: line, ok: false, error: k.error }
  }
  return okRow(lineNumber, line, vs.home, vs.away, k.iso)
}

/** Comma body: two teams only, or teams + optional kickoff in remaining columns. */
function parseCommaBody(line: string, lineNumber: number): ParsedGameLine {
  const parts = line.split(',').map((p) => p.trim())
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
    return okRow(lineNumber, line, home_team, away_team, getDefaultKickoffNextSaturday15Local())
  }
  const datetimePart = parts.slice(2).join(', ')
  const k = parseKickoffLocal(datetimePart)
  if (!k.ok) {
    return { lineNumber, raw: line, ok: false, error: k.error }
  }
  return okRow(lineNumber, line, home_team, away_team, k.iso)
}

/** `Home vs Away` only — default kickoff. */
function parseVsOnly(line: string, lineNumber: number): ParsedGameLine {
  const vs = splitVsSides(line)
  if (!vs) {
    return {
      lineNumber,
      raw: line,
      ok: false,
      error: 'Use "Home vs Away" or "Home, Away"',
    }
  }
  return okRow(lineNumber, line, vs.home, vs.away, getDefaultKickoffNextSaturday15Local())
}

/**
 * One non-empty textarea line: vs-only, comma (2 or 3+ cols), or vs + optional `| kickoff`.
 */
export function parseGameMatchLine(line: string, lineNumber: number): ParsedGameLine {
  const trimmed = line.trim()
  if (!trimmed) {
    return { lineNumber, raw: line, ok: false, error: 'Empty line' }
  }

  if (trimmed.includes('|')) {
    return parsePipeFormat(trimmed, lineNumber)
  }

  if (trimmed.includes(',')) {
    return parseCommaBody(trimmed, lineNumber)
  }

  if (/\bvs\b/i.test(trimmed)) {
    return parseVsOnly(trimmed, lineNumber)
  }

  return {
    lineNumber,
    raw: line,
    ok: false,
    error: 'Use "Home vs Away" or "Home, Away" (optional: "| YYYY-MM-DD HH:mm" or third CSV column)',
  }
}

export function parseGameMatchesBulk(text: string): ParsedGameLine[] {
  const lines = text.split(/\r?\n/)
  const out: ParsedGameLine[] = []
  let n = 0
  for (const line of lines) {
    n += 1
    if (!line.trim()) continue
    out.push(parseGameMatchLine(line, n))
  }
  return out
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function isCsvHeaderRow(parts: string[]): boolean {
  if (parts.length < 2) return false
  const a = parts[0].trim().toLowerCase()
  const b = parts[1].trim().toLowerCase()
  return a === 'home_team' && b === 'away_team'
}

/** Parse CSV text: Option A `home_team,away_team` + rows; Option B optional `kickoff_time` column. */
export function parseGameMatchesCsv(csvText: string): ParsedGameLine[] {
  const text = stripBom(csvText)
  const lines = text.split(/\r?\n/)
  const out: ParsedGameLine[] = []
  let sawHeader = false

  for (let i = 0; i < lines.length; i += 1) {
    const physicalLine = i + 1
    const rawLine = lines[i]
    if (!rawLine.trim()) continue

    const parts = rawLine.split(',').map((p) => p.trim())
    if (!sawHeader && isCsvHeaderRow(parts)) {
      sawHeader = true
      continue
    }

    if (parts.length < 2) {
      out.push({
        lineNumber: physicalLine,
        raw: rawLine,
        ok: false,
        error: 'CSV row needs at least two columns (home_team, away_team)',
      })
      continue
    }

    if (isCsvHeaderRow(parts)) {
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
        error: 'home_team and away_team cannot be empty',
      })
      continue
    }

    if (parts.length === 2) {
      out.push(
        okRow(physicalLine, rawLine, home_team, away_team, getDefaultKickoffNextSaturday15Local())
      )
      continue
    }

    const datetimePart = parts.slice(2).join(', ')
    const k = parseKickoffLocal(datetimePart)
    if (!k.ok) {
      out.push({ lineNumber: physicalLine, raw: rawLine, ok: false, error: k.error })
      continue
    }
    out.push(okRow(physicalLine, rawLine, home_team, away_team, k.iso))
  }

  return out
}
