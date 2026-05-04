export type SheetTeamCsvRow = {
  team_name: string
  canonical_name: string
  /** Trimmed cell from the team_name / display column (may be empty when only canonical is set). */
  raw_team_name: string
  /** Trimmed cell from the canonical_name column (may be empty when only team_name is set). */
  raw_canonical_name: string
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
  return v
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function splitAliases(raw: string): string[] {
  const s = raw.trim()
  if (!s) return []
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

/** Lookup key for sheet sync: trim + lowercase (used for Teams tab + fixture cells). */
export function teamLookupNormalize(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * All distinct lookup keys for a Teams CSV row: raw team_name cell, raw canonical_name cell,
 * comma-separated aliases, plus coalesced display fields (so nothing is alias-only).
 */
export function buildTeamLookupKeys(row: SheetTeamCsvRow): string[] {
  const keys = new Set<string>()
  const add = (s: string) => {
    const k = teamLookupNormalize(s)
    if (k) keys.add(k)
  }
  add(row.raw_team_name)
  add(row.raw_canonical_name)
  add(row.team_name)
  add(row.canonical_name)
  for (const a of splitAliases(row.aliases)) {
    add(a)
  }
  return [...keys]
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
    const rawTeam = col.team_name >= 0 ? read(cells, col.team_name) : ''
    const rawCanon = col.canonical_name >= 0 ? read(cells, col.canonical_name) : ''
    const canonical = rawCanon || rawTeam
    const display = rawTeam || canonical
    if (!display) {
      errors.push(`Teams row ${li + 1}: empty team_name and canonical_name`)
      continue
    }
    rows.push({
      team_name: display,
      canonical_name: canonical || display,
      raw_team_name: rawTeam,
      raw_canonical_name: rawCanon,
      province: read(cells, col.province),
      is_prestige_team: read(cells, col.is_prestige_team),
      is_wp_elite: read(cells, col.is_wp_elite),
      aliases: read(cells, col.aliases),
    })
  }
  return { rows, errors }
}

type RegistryEntry = ResolvedSheetTeam & { lookupKeys: Set<string> }

/**
 * In-memory registry from the Teams tab — source of truth for identity, province, flags.
 */
function significantTokens(normalizedKey: string): string[] {
  return normalizedKey.split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
}

export class SheetTeamsRegistry {
  private byKey = new Map<string, RegistryEntry>()
  private readonly allLookupKeysSorted: string[]

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
      for (const k of buildTeamLookupKeys(r)) {
        entry.lookupKeys.add(k)
      }
      for (const k of entry.lookupKeys) {
        if (!this.byKey.has(k)) this.byKey.set(k, entry)
      }
    }
    this.allLookupKeysSorted = [...this.byKey.keys()].sort((a, b) => a.localeCompare(b))
  }

  /** Sorted list of every distinct lookup key in the registry (for debug / suggestions). */
  getAllLookupKeys(): string[] {
    return [...this.allLookupKeysSorted]
  }

  /**
   * Keys that share at least one significant token (len ≥ 3) with the fixture cell, ranked by overlap.
   */
  findSimilarLookupKeys(rawFixtureCell: string, limit: number): string[] {
    const q = teamLookupNormalize(rawFixtureCell)
    if (!q) return []
    const tokens = significantTokens(q)
    if (!tokens.length) {
      const prefix = q.slice(0, Math.min(4, q.length))
      if (!prefix) return []
      return this.allLookupKeysSorted.filter((k) => k.includes(prefix)).slice(0, limit)
    }
    const scored = this.allLookupKeysSorted
      .map((k) => {
        let score = 0
        for (const t of tokens) {
          if (k.includes(t)) score += 1
        }
        return { k, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.k.localeCompare(b.k))
    return scored.slice(0, limit).map((x) => x.k)
  }

  resolve(fixtureCell: string): { ok: true; team: ResolvedSheetTeam } | { ok: false; reason: string } {
    const k = teamLookupNormalize(fixtureCell)
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

export type TeamsRegistryUnresolvedTeam = {
  fixture_sheet_row: number
  side: 'home' | 'away'
  raw_team_value: string
  normalized_team_key: string
  similar_lookup_keys: string[]
}

/** Preview-only: prove which Teams CSV was used and how registry keys resolve. */
export type TeamsRegistryDebug = {
  teams_csv_url_used: string
  teams_rows_count: number
  first_5_canonical_names: string[]
  has_lookup_heidelberg_volkskool: boolean
  has_lookup_hugenote_welkom: boolean
  all_lookup_keys_containing_heidelberg: string[]
  all_lookup_keys_containing_hugenote: string[]
  unresolved_teams: TeamsRegistryUnresolvedTeam[]
}

export function buildTeamsRegistryDebug(
  registry: SheetTeamsRegistry,
  params: {
    teamsRowsCount: number
    teamsCsvUrlUsedMasked: string
    firstFiveCanonicalNames: string[]
    unresolvedTeams: TeamsRegistryUnresolvedTeam[]
  }
): TeamsRegistryDebug {
  const keys = registry.getAllLookupKeys()
  return {
    teams_csv_url_used: params.teamsCsvUrlUsedMasked,
    teams_rows_count: params.teamsRowsCount,
    first_5_canonical_names: params.firstFiveCanonicalNames,
    has_lookup_heidelberg_volkskool: registry.resolve('Heidelberg Volkskool').ok,
    has_lookup_hugenote_welkom: registry.resolve('Hugenote Welkom').ok,
    all_lookup_keys_containing_heidelberg: keys.filter((k) => k.includes('heidelberg')),
    all_lookup_keys_containing_hugenote: keys.filter((k) => k.includes('hugenote')),
    unresolved_teams: params.unresolvedTeams,
  }
}
