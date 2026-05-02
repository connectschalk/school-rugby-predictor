/**
 * Structured warnings for Master Sheet sync (API + admin UI).
 * Plain-string validation_errors are normalized into this shape for display.
 */

export type SyncWarningSeverity = 'warning' | 'error'

export type SyncWarningCategory =
  | 'group_link'
  | 'province'
  | 'duplicate'
  | 'team_date'
  | 'validation'
  | 'insert'
  | 'update'

export type SyncWarningItem = {
  severity: SyncWarningSeverity
  category: SyncWarningCategory
  date: string | null
  home_team: string | null
  away_team: string | null
  message: string
  suggested_fix: string | null
  /** Source row in Google Sheet (1-based data row) when parsed */
  sheet_row?: number | null
}

export type SyncWarningFilter =
  | 'all'
  | 'critical'
  | 'group_link'
  | 'duplicate'
  | 'team_date'
  | 'province'

const VS_IN_PARENS = /\(([^)]+)\s+vs\s+([^)]+)\)/i

function extractTeamsVs(message: string): { home: string | null; away: string | null } {
  const m = message.match(VS_IN_PARENS)
  if (m) return { home: m[1].trim(), away: m[2].trim() }
  return { home: null, away: null }
}

function inferSeverity(message: string): SyncWarningSeverity {
  const m = message.toLowerCase()
  if (
    /\bfailed\b/i.test(message) ||
    /missing required/i.test(m) ||
    /missing score/i.test(m) ||
    /home_team and away_team are the same/i.test(m) ||
    /could not reject/i.test(m) ||
    /sync log insert failed/i.test(m)
  ) {
    return 'error'
  }
  return 'warning'
}

function inferCategory(message: string): SyncWarningCategory {
  const lower = message.toLowerCase()
  if (
    lower.includes('no fixture group') ||
    lower.includes('group link') ||
    lower.includes('could not link fixture group') ||
    lower.includes('could not clear old group links')
  ) {
    return 'group_link'
  }
  if (lower.includes('province_group') || lower.includes('unknown province')) return 'province'
  if (lower.includes('duplicate pair_key') || lower.includes('duplicate')) return 'duplicate'
  if (lower.includes('same team appears multiple times') || lower.includes('same date')) return 'team_date'
  if (
    lower.includes('upcoming insert failed') ||
    lower.includes('upcoming update failed') ||
    lower.includes('insert into matches failed') ||
    lower.includes('game_matches insert failed') ||
    lower.includes('completed insert')
  ) {
    return 'insert'
  }
  if (
    lower.includes('update failed') ||
    lower.includes('matches update') ||
    lower.includes('game_matches update failed') ||
    lower.includes('completed update')
  ) {
    return 'update'
  }
  return 'validation'
}

function extractDateFromMessage(message: string): string | null {
  const iso = message.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
  const pipe = message.match(/\((\d{4}-\d{2}-\d{2})\|/)
  if (pipe) return pipe[1]
  return null
}

function extractSheetRow(message: string): number | null {
  const m = message.match(/(?:row|Row)\s+(\d+)\s*:/i)
  if (m) return Number(m[1])
  const w = message.match(/Warning row\s+(\d+)\s*:/i)
  if (w) return Number(w[1])
  return null
}

function suggestedFix(category: SyncWarningCategory, message: string): string | null {
  const lower = message.toLowerCase()
  switch (category) {
    case 'province':
      return 'Use a known province_group label (or canonical name) from Fixture groups, or leave blank if N/A.'
    case 'group_link':
      return 'Add or fix league_group / province_group in the sheet to match a fixture group name, slug, or alias in Admin → Fixture groups.'
    case 'duplicate':
      return 'Remove duplicate rows for the same pair_key or same teams on the same date in the Google Sheet.'
    case 'team_date':
      return 'Ensure each team plays at most once per date in the sheet; remove or merge duplicate fixtures.'
    case 'insert':
    case 'update':
      return 'Check DB constraints and team names; verify the fixture row matches an existing game_matches row when updating.'
    default:
      if (lower.includes('team resolution')) {
        return 'Add team aliases in Admin or fix spelling to match teams in the database.'
      }
      if (lower.includes('missing score')) {
        return 'Enter home_score and away_score for completed fixtures.'
      }
      return null
  }
}

/** Convert a single legacy/plain sync message to a structured item. */
export function parseSyncWarningString(message: string): SyncWarningItem {
  const trimmed = message.trim()
  const category = inferCategory(trimmed)
  const severity = inferSeverity(trimmed)
  let home_team: string | null = null
  let away_team: string | null = null
  const vs = extractTeamsVs(trimmed)
  if (vs.home && vs.away) {
    home_team = vs.home
    away_team = vs.away
  }
  const date = extractDateFromMessage(trimmed)
  const sheet_row = extractSheetRow(trimmed)
  return {
    severity,
    category,
    date,
    home_team,
    away_team,
    message: trimmed,
    suggested_fix: suggestedFix(category, trimmed),
    sheet_row: sheet_row ?? undefined,
  }
}

/** Normalize API output: structured array, or legacy string array. */
export function normalizeSyncWarningsInput(
  raw: unknown
): SyncWarningItem[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    if (raw.length === 0) return []
    const first = raw[0]
    if (typeof first === 'string') {
      return (raw as string[]).map(parseSyncWarningString)
    }
    return (raw as Record<string, unknown>[]).map((o) => ({
      severity: o.severity === 'error' ? 'error' : 'warning',
      category: (['group_link', 'province', 'duplicate', 'team_date', 'validation', 'insert', 'update'].includes(
        String(o.category)
      )
        ? (o.category as SyncWarningCategory)
        : 'validation') as SyncWarningCategory,
      date: o.date != null ? String(o.date) : null,
      home_team: o.home_team != null ? String(o.home_team) : null,
      away_team: o.away_team != null ? String(o.away_team) : null,
      message: String(o.message ?? ''),
      suggested_fix: o.suggested_fix != null ? String(o.suggested_fix) : null,
      sheet_row: o.sheet_row != null ? Number(o.sheet_row) : undefined,
    }))
  }
  return []
}

export function buildStructuredWarningsFromStrings(errors: string[]): SyncWarningItem[] {
  return errors.map(parseSyncWarningString)
}

export function countWarningsByCategory(items: SyncWarningItem[]): Record<SyncWarningCategory, number> {
  const init: Record<SyncWarningCategory, number> = {
    group_link: 0,
    province: 0,
    duplicate: 0,
    team_date: 0,
    validation: 0,
    insert: 0,
    update: 0,
  }
  for (const w of items) {
    init[w.category] += 1
  }
  return init
}

export function filterSyncWarnings(
  items: SyncWarningItem[],
  filter: SyncWarningFilter,
  search: string
): SyncWarningItem[] {
  const q = search.trim().toLowerCase()
  let list = items
  if (filter === 'critical') {
    list = items.filter((w) => w.severity === 'error')
  } else if (filter === 'group_link') {
    list = items.filter((w) => w.category === 'group_link')
  } else if (filter === 'duplicate') {
    list = items.filter((w) => w.category === 'duplicate')
  } else if (filter === 'team_date') {
    list = items.filter((w) => w.category === 'team_date')
  } else if (filter === 'province') {
    list = items.filter((w) => w.category === 'province')
  }
  if (!q) return list
  return list.filter((w) => {
    const blob = [
      w.message,
      w.home_team,
      w.away_team,
      w.date,
      w.category,
      w.suggested_fix,
      w.sheet_row != null ? String(w.sheet_row) : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return blob.includes(q)
  })
}
