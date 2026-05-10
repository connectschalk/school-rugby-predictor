import type { SupabaseClient } from '@supabase/supabase-js'
import type { SheetTeamCsvRow } from '@/lib/sheet-teams-registry'
import {
  normalizeTeamKey,
  normalizeTeamKeyAsciiFold,
  normalizeTeamKeyLoose,
} from '@/lib/team-name-match'

const SYNC_BATCH = 80

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function splitAliasList(raw: string): string[] {
  const s = raw.trim()
  if (!s) return []
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

/** All alias strings for one Teams sheet row (team_name, canonical_name, comma-separated aliases). */
export function collectTeamSheetAliasStrings(row: SheetTeamCsvRow): string[] {
  const canon = (row.canonical_name || row.team_name).trim()
  const display = (row.team_name || row.canonical_name).trim()
  const set = new Set<string>()
  if (display) set.add(display)
  if (canon) set.add(canon)
  for (const a of splitAliasList(row.aliases)) set.add(a)
  return [...set].filter(Boolean)
}

/**
 * Resolver map: normalized lookup keys → sheet `canonical_name` (same value written as `teams.name` on sync).
 */
export function buildTeamsSheetAliasResolverMap(rows: SheetTeamCsvRow[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const row of rows) {
    const targetCanon = (row.canonical_name || row.team_name).trim()
    if (!targetCanon) continue
    for (const a of collectTeamSheetAliasStrings(row)) {
      const k = normalizeTeamKey(a)
      if (k) m.set(k, targetCanon)
      const loose = normalizeTeamKeyLoose(a)
      if (loose && loose !== k) m.set(loose, targetCanon)
      const af = normalizeTeamKeyAsciiFold(a)
      if (af && af !== k && af !== loose) m.set(af, targetCanon)
    }
  }
  return m
}

type DbTeamLite = { id: number; name: string; canonical_name: string | null }

function foldKey(s: string): string {
  return normalizeTeamKeyAsciiFold(s)
}

function findTeamIdsByFoldKey(teams: DbTeamLite[], key: string): number[] {
  const out: number[] = []
  for (const t of teams) {
    const nk = foldKey(t.name)
    const ck = t.canonical_name ? foldKey(t.canonical_name) : ''
    if (nk === key || (ck && ck === key)) out.push(t.id)
  }
  return out
}

/**
 * Writes `teams` and `team_aliases` from the Teams sheet (non–dry-run sync only).
 * `teams.name` and `teams.canonical_name` are set to the sheet canonical; `province` from the sheet.
 * Replaces `team_aliases` for each touched `team_id` with sheet-derived rows (`normalized_alias` = ascii-fold).
 */
export async function upsertTeamsAndAliasesFromTeamsSheet(
  supabase: SupabaseClient,
  rows: SheetTeamCsvRow[],
  errors: string[]
): Promise<void> {
  const { data: teamData, error: loadErr } = await supabase.from('teams').select('id, name, canonical_name')
  if (loadErr) {
    errors.push(`Teams upsert: could not load teams: ${loadErr.message}`)
    return
  }
  let dbTeams: DbTeamLite[] = (teamData as DbTeamLite[] | null) ?? []

  for (const row of rows) {
    const canon = (row.canonical_name || row.team_name).trim()
    if (!canon) continue
    const provinceRaw = row.province.trim()
    const province = provinceRaw ? provinceRaw : null
    const fk = foldKey(canon)
    const candidates = findTeamIdsByFoldKey(dbTeams, fk)
    if (candidates.length > 1) {
      errors.push(
        `Teams upsert: multiple teams match canonical ${JSON.stringify(canon)} (ascii-fold); ids=${candidates.join(', ')} — skipped row`
      )
      continue
    }

    let teamId: number | null = candidates[0] ?? null

    if (teamId != null) {
      const { error: upErr } = await supabase
        .from('teams')
        .update({ name: canon, canonical_name: canon, province })
        .eq('id', teamId)
      if (upErr) {
        errors.push(`Teams upsert: update failed for ${JSON.stringify(canon)}: ${upErr.message}`)
        continue
      }
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('teams')
        .insert({ name: canon, canonical_name: canon, province })
        .select('id')
        .maybeSingle()
      if (insErr || ins?.id == null) {
        errors.push(`Teams upsert: insert failed for ${JSON.stringify(canon)}: ${insErr?.message ?? 'no id'}`)
        continue
      }
      teamId = Number(ins.id)
      if (!Number.isFinite(teamId)) continue
      dbTeams.push({ id: teamId, name: canon, canonical_name: canon })
    }

    const { error: delErr } = await supabase.from('team_aliases').delete().eq('team_id', teamId)
    if (delErr) {
      errors.push(`team_aliases delete failed for team_id=${teamId}: ${delErr.message}`)
      continue
    }

    const aliasStrings = collectTeamSheetAliasStrings(row)
    const payloads = aliasStrings.map((alias) => ({
      team_id: teamId,
      alias,
      normalized_alias: normalizeTeamKeyAsciiFold(alias),
    }))

    for (const part of chunk(payloads, SYNC_BATCH)) {
      if (part.length === 0) continue
      const { error: aErr } = await supabase.from('team_aliases').insert(part)
      if (aErr) {
        errors.push(`team_aliases insert failed for ${JSON.stringify(canon)}: ${aErr.message}`)
        break
      }
    }
  }
}
