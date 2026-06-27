import type { SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_MEMORY_CATEGORIES = [
  { name: 'General', icon: 'pin', colour: '#FFD400', description: 'General memories and uncategorised stories' },
  { name: 'Sport', icon: 'trophy', colour: '#A855F7', description: null },
  { name: 'History', icon: 'landmark', colour: '#3B82F6', description: null },
  { name: 'Hostel', icon: 'home', colour: '#22C55E', description: null },
  { name: 'Interviews', icon: 'mic', colour: '#EF4444', description: null },
  { name: 'Events', icon: 'calendar', colour: '#F97316', description: null },
  { name: 'Archive', icon: 'archive', colour: '#9CA3AF', description: null },
] as const

export async function ensureGeneralCategory(
  client: SupabaseClient,
  mapId: string
): Promise<{ categoryId: string | null; error: string | null }> {
  const { data, error } = await client.rpc('ensure_default_memory_category', {
    p_memory_map_id: mapId,
  })
  if (error) return { categoryId: null, error: error.message }
  return { categoryId: data == null ? null : String(data), error: null }
}

export async function createDefaultMemoryCategories(
  client: SupabaseClient,
  mapId: string
): Promise<{ error: string | null }> {
  const { error: ensureErr } = await ensureGeneralCategory(client, mapId)
  if (ensureErr) return { error: ensureErr }

  const { data: existing, error: fetchErr } = await client
    .from('memory_categories')
    .select('name')
    .eq('memory_map_id', mapId)

  if (fetchErr) return { error: fetchErr.message }

  const existingNames = new Set((existing ?? []).map((row) => row.name))
  const rows = DEFAULT_MEMORY_CATEGORIES.filter((c) => !existingNames.has(c.name)).map((c, i) => ({
    memory_map_id: mapId,
    name: c.name,
    description: c.description,
    icon: c.icon,
    colour: c.colour,
    sort_order: c.name === 'General' ? 0 : i + 1,
    is_active: true,
  }))

  if (rows.length === 0) return { error: null }

  const { error } = await client.from('memory_categories').insert(rows)
  return { error: error?.message ?? null }
}
