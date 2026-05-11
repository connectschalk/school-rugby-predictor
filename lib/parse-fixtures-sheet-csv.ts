import { splitCsvLine } from '@/lib/parse-game-matches-bulk'

function normalizeHeader(v: string): string {
  return v
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

export function normalizeDate(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

export function normalizeTime(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  const hm = s.match(/^(\d{1,2}):(\d{2})$/)
  if (hm) return `${String(Number(hm[1])).padStart(2, '0')}:${hm[2]}`
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getHours())}:${p(dt.getMinutes())}`
}

/** Raw row from the Fixtures tab CSV (Teams + Fixtures are the only source of truth). */
export type FixtureCsvRow = {
  date: string
  time: string
  home_team: string
  away_team: string
  home_score: string
  away_score: string
  league_group: string
  /** Present only when the CSV includes a fixture_key (or alias) column. */
  fixture_key?: string
  /** Present only when the CSV includes province_group / province column. */
  province_group?: string
  is_prestige: string
  status: string
  verification_status: string
  source: string
}

export function parseFixturesSheetCsv(csvText: string): { rows: FixtureCsvRow[]; errors: string[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return { rows: [], errors: ['Fixtures CSV is empty'] }

  const header = splitCsvLine(lines[0]).map(normalizeHeader)
  const firstIdx = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  const idx = {
    date: header.indexOf('date'),
    time: header.indexOf('time'),
    home_team: header.indexOf('home_team'),
    away_team: header.indexOf('away_team'),
    home_score: header.indexOf('home_score'),
    away_score: header.indexOf('away_score'),
    league_group: firstIdx(['league_group', 'league']),
    fixture_key: firstIdx(['fixture_key', 'fixture_id', 'match_key', 'id']),
    province_group: firstIdx(['province_group', 'province']),
    is_prestige: firstIdx(['is_prestige', 'prestige']),
    status: header.indexOf('status'),
    verification_status: header.indexOf('verification_status'),
    source: header.indexOf('source'),
  }
  if (idx.date < 0 || idx.time < 0 || idx.home_team < 0 || idx.away_team < 0) {
    return {
      rows: [],
      errors: ['Fixtures CSV requires headers: date, time, home_team, away_team'],
    }
  }

  const rows: FixtureCsvRow[] = []
  const errors: string[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i])
    const read = (k: keyof typeof idx) => (idx[k] >= 0 ? (cells[idx[k]] ?? '').trim() : '')
    const row: FixtureCsvRow = {
      date: read('date'),
      time: read('time'),
      home_team: read('home_team'),
      away_team: read('away_team'),
      home_score: read('home_score'),
      away_score: read('away_score'),
      league_group: read('league_group'),
      is_prestige: idx.is_prestige >= 0 ? read('is_prestige') : '',
      status: read('status'),
      verification_status: read('verification_status'),
      source: read('source'),
    }
    if (idx.fixture_key >= 0) row.fixture_key = read('fixture_key')
    if (idx.province_group >= 0) row.province_group = read('province_group')
    rows.push(row)
  }
  return { rows, errors }
}
