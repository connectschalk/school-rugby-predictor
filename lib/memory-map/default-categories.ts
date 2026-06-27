import type { SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_MEMORY_CATEGORIES = [
  { name: 'General', icon: 'pin', colour: '#FFD400' },
  { name: 'Sport', icon: 'trophy', colour: '#A855F7' },
  { name: 'History', icon: 'landmark', colour: '#3B82F6' },
  { name: 'Hostel', icon: 'home', colour: '#22C55E' },
  { name: 'Interviews', icon: 'mic', colour: '#EF4444' },
  { name: 'Events', icon: 'calendar', colour: '#F97316' },
  { name: 'Archive', icon: 'archive', colour: '#9CA3AF' },
] as const

export async function createDefaultMemoryCategories(
  client: SupabaseClient,
  mapId: string
): Promise<{ error: string | null }> {
  const { data: existing, error: fetchErr } = await client
    .from('memory_categories')
    .select('name')
    .eq('memory_map_id', mapId)

  if (fetchErr) return { error: fetchErr.message }

  const existingNames = new Set((existing ?? []).map((row) => row.name))
  const rows = DEFAULT_MEMORY_CATEGORIES.filter((c) => !existingNames.has(c.name)).map((c, i) => ({
    memory_map_id: mapId,
    name: c.name,
    icon: c.icon,
    colour: c.colour,
    sort_order: i + 1,
    is_active: true,
  }))

  if (rows.length === 0) return { error: null }

  const { error } = await client.from('memory_categories').insert(rows)
  return { error: error?.message ?? null }
}
