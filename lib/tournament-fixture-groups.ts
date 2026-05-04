import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ensures each distinct tournament name has a `fixture_groups` row (`group_type = tournament`).
 * Uses `admin_create_fixture_group` (admin JWT). Idempotent per slug.
 */
export async function ensureTournamentFixtureGroups(
  supabase: SupabaseClient,
  names: Iterable<string>
): Promise<{ error: string | null }> {
  const seen = new Set<string>()
  for (const raw of names) {
    const n = (raw ?? '').trim()
    if (!n) continue
    const key = n.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const { error } = await supabase.rpc('admin_create_fixture_group', {
      p_name: n,
      p_group_type: 'tournament',
    })
    if (error) {
      return { error: `Tournament fixture group "${n}": ${error.message}` }
    }
  }
  return { error: null }
}
