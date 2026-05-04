export type ParsedMasterPasteRow = {
  kickoff_time: string
  home_team: string
  away_team: string
  province_group: string
  league_group: string
  tournament: string
  home_team_province: string
  away_team_province: string
  is_prestige: boolean
}

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'y'
}

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((x) => x.trim())
  return line.split(',').map((x) => x.trim())
}

function normHeader(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '_')
}

function toSastIso(year: number, month: number, day: number, hour: number, minute: number): string {
  return new Date(Date.UTC(year, month - 1, day, hour - 2, minute, 0, 0)).toISOString()
}

function parseDate(input: string): { y: number; m: number; d: number } | null {
  const s = input.trim()
  if (!s) return null

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) }

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) return { y: Number(slash[3]), m: Number(slash[2]), d: Number(slash[1]) }

  const long = new Date(s)
  if (!Number.isNaN(long.getTime())) {
    return { y: long.getFullYear(), m: long.getMonth() + 1, d: long.getDate() }
  }
  return null
}

function parseTimeOrDefault(input: string): { h: number; m: number } {
  const s = input.trim()
  if (!s) return { h: 11, m: 0 }
  const hm = s.match(/^(\d{1,2}):(\d{2})$/)
  if (hm) return { h: Number(hm[1]), m: Number(hm[2]) }
  const dt = new Date(s)
  if (!Number.isNaN(dt.getTime())) return { h: dt.getHours(), m: dt.getMinutes() }
  return { h: 11, m: 0 }
}

function readCell(cells: string[], idx: number): string {
  return idx >= 0 ? (cells[idx] ?? '').trim() : ''
}

export function parseMasterSheetPaste(text: string): { rows: ParsedMasterPasteRow[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return { rows: [], errors: [] }

  const first = splitLine(lines[0]).map(normHeader)
  const idx = {
    date: first.findIndex((h) => h === 'date' || h === 'match_date'),
    time: first.findIndex((h) => h === 'kickoff_time' || h === 'time'),
    home: first.findIndex((h) => h === 'home_team' || h === 'home'),
    away: first.findIndex((h) => h === 'away_team' || h === 'away'),
    province: first.findIndex((h) => h === 'province_group' || h === 'province'),
    league: first.findIndex((h) => h === 'league_group' || h === 'league'),
    tournament: first.findIndex((h) => h === 'tournament' || h === 'tournament_name' || h === 'cup'),
    home_prov: first.findIndex(
      (h) =>
        h === 'home_team_province' ||
        h === 'home_province' ||
        h === 'home_prov' ||
        h === 'home_team_prov'
    ),
    away_prov: first.findIndex(
      (h) =>
        h === 'away_team_province' ||
        h === 'away_province' ||
        h === 'away_prov' ||
        h === 'away_team_prov'
    ),
    prestige: first.findIndex((h) => h === 'is_prestige' || h === 'prestige'),
  }
  const hasHeader = idx.home >= 0 && idx.away >= 0 && idx.date >= 0

  const start = hasHeader ? 1 : 0
  const rows: ParsedMasterPasteRow[] = []
  const errors: string[] = []

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]
    const cells = splitLine(line)

    const dateRaw = hasHeader ? readCell(cells, idx.date) : (cells[0] ?? '').trim()
    const timeRaw = hasHeader ? readCell(cells, idx.time) : (cells[1] ?? '').trim()
    const home = hasHeader ? readCell(cells, idx.home) : (cells[2] ?? '').trim()
    const away = hasHeader ? readCell(cells, idx.away) : (cells[3] ?? '').trim()
    const province = hasHeader ? readCell(cells, idx.province) : (cells[4] ?? '').trim()
    const league = hasHeader ? readCell(cells, idx.league) : (cells[5] ?? '').trim()
    const tournament = hasHeader ? readCell(cells, idx.tournament) : ''
    const homeProv = hasHeader ? readCell(cells, idx.home_prov) : (cells[7] ?? '').trim()
    const awayProv = hasHeader ? readCell(cells, idx.away_prov) : (cells[8] ?? '').trim()
    const prestigeRaw = hasHeader ? readCell(cells, idx.prestige) : (cells[6] ?? '').trim()

    const d = parseDate(dateRaw)
    if (!d) {
      errors.push(`Line ${i + 1}: invalid date "${dateRaw}"`)
      continue
    }
    const t = parseTimeOrDefault(timeRaw)
    const kickoff = toSastIso(d.y, d.m, d.d, t.h, t.m)

    rows.push({
      kickoff_time: kickoff,
      home_team: home,
      away_team: away,
      province_group: province,
      league_group: league,
      tournament,
      home_team_province: homeProv,
      away_team_province: awayProv,
      is_prestige: parseBool(prestigeRaw),
    })
  }

  return { rows, errors }
}
