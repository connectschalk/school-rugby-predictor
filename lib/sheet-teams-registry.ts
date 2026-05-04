export type SheetTeamCsvRow = {
  team_name: string
  canonical_name: string
  province: string
  is_prestige_team: string
  is_wp_elite: string
  aliases: string
}

export type ResolvedSheetTeam = {
  teamName: string
  canonicalName: string
  province: string | null
  isPrestigeTeam: boolean
  isWpElite: boolean
}

function parseBoolCell(v: string): boolean {
  const x = v.trim().toLowerCase()
  return x === 'true' || x === '1' || x === 'yes' || x === 'y'
}

function normHeader(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '_')
}

function splitAliases(raw: string): string[] {
  const s = raw.trim()
  if (!s) return []
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

/** Single lookup key: trim + lowercase (no other normalization). */
function lookupKey(raw: string): string {
  return raw.trim().toLowerCase()
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === ',') {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur.trim())
  return out
}

/**
 * Parse the Google Sheet **Teams** tab CSV. First row must be headers.
 */
export function parseTeamsSheetCsv(csvText: string): { rows: SheetTeamCsvRow[]; errors: string[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return { rows: [], errors: ['Teams CSV is empty'] }

  const header = splitCsvLine(lines[0]).map(normHeader)
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  const col = {
    team_name: idx(['team_name', 'team', 'display_name']),
    canonical_name: idx(['canonical_name', 'canonical']),
    province: idx(['province', 'team_province']),
    is_prestige_team: idx(['is_prestige_team', 'prestige_team', 'school_prestige']),
    is_wp_elite: idx(['is_wp_elite', 'wp_elite']),
    aliases: idx(['aliases', 'alias', 'aka']),
  }
  if (col.team_name < 0 && col.canonical_name < 0) {
    return { rows: [], errors: ['Teams CSV requires team_name and/or canonical_name column'] }
  }

  const read = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '')
  const rows: SheetTeamCsvRow[] = []
  const errors: string[] = []

  for (let li = 1; li < lines.length; li += 1) {
    const cells = splitCsvLine(lines[li])
    const teamName = read(cells, col.team_name)
    const canonical = read(cells, col.canonical_name) || teamName
    const display = teamName || canonical
    if (!display) {
      errors.push(`Teams row ${li + 1}: empty team_name and canonical_name`)
      continue
    }
    rows.push({
      team_name: display,
      canonical_name: canonical || display,
      province: read(cells, col.province),
      is_prestige_team: read(cells, col.is_prestige_team),
      is_wp_elite: read(cells, col.is_wp_elite),
      aliases: read(cells, col.aliases),
    })
  }
  return { rows, errors }
}

type RegistryEntry = ResolvedSheetTeam & { lookupKeys: Set<string> }

function addKey(set: Set<string>, raw: string) {
  const k = lookupKey(raw)
  if (!k) return
  set.add(k)
}

/**
 * In-memory registry from the Teams tab — source of truth for identity, province, flags.
 */
export class SheetTeamsRegistry {
  private byKey = new Map<string, RegistryEntry>()

  constructor(rows: SheetTeamCsvRow[]) {
    for (const r of rows) {
      const canonicalName = (r.canonical_name || r.team_name).trim()
      const teamName = (r.team_name || canonicalName).trim()
      const provinceRaw = r.province.trim()
      const entry: RegistryEntry = {
        teamName,
        canonicalName,
        province: provinceRaw ? provinceRaw : null,
        isPrestigeTeam: parseBoolCell(r.is_prestige_team),
        isWpElite: parseBoolCell(r.is_wp_elite),
        lookupKeys: new Set<string>(),
      }
      addKey(entry.lookupKeys, teamName)
      addKey(entry.lookupKeys, canonicalName)
      for (const a of splitAliases(r.aliases)) {
        addKey(entry.lookupKeys, a)
      }
      for (const k of entry.lookupKeys) {
        if (!this.byKey.has(k)) this.byKey.set(k, entry)
      }
    }
  }

  resolve(fixtureCell: string): { ok: true; team: ResolvedSheetTeam } | { ok: false; reason: string } {
    const k = lookupKey(fixtureCell)
    if (!k) return { ok: false, reason: 'empty' }
    const hit = this.byKey.get(k)
    if (!hit) return { ok: false, reason: 'not_in_teams_tab' }
    return {
      ok: true,
      team: {
        teamName: hit.teamName,
        canonicalName: hit.canonicalName,
        province: hit.province,
        isPrestigeTeam: hit.isPrestigeTeam,
        isWpElite: hit.isWpElite,
      },
    }
  }

  get size(): number {
    return new Set([...this.byKey.values()].map((e) => e.canonicalName)).size
  }
}
