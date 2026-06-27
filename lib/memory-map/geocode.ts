export type GeocodeResult = {
  id: string
  name: string
  displayName: string
  lat: number
  lng: number
}

export const MIN_GEOCODE_QUERY_LENGTH = 3

export const NOMINATIM_USER_AGENT = 'NextPlayMemoryMap/1.0 (info@thenextplay.co.za)'

type NominatimRow = {
  place_id?: number | string
  display_name?: string
  name?: string
  lat?: string
  lon?: string
}

export function isValidGeocodeQuery(query: string): boolean {
  return query.trim().length >= MIN_GEOCODE_QUERY_LENGTH
}

export function mapNominatimResults(rows: NominatimRow[]): GeocodeResult[] {
  const results: GeocodeResult[] = []
  for (const row of rows) {
    const lat = row.lat != null ? parseFloat(row.lat) : NaN
    const lng = row.lon != null ? parseFloat(row.lon) : NaN
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const displayName = row.display_name?.trim() || `${lat}, ${lng}`
    const name = row.name?.trim() || displayName.split(',')[0]?.trim() || displayName
    const id = row.place_id != null ? String(row.place_id) : `${lat},${lng}`
    results.push({ id, name, displayName, lat, lng })
  }
  return results
}

export async function searchNominatim(
  query: string,
  options?: { countryCodes?: string; limit?: number }
): Promise<GeocodeResult[]> {
  const q = query.trim()
  if (!isValidGeocodeQuery(q)) return []

  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: String(options?.limit ?? 5),
    addressdetails: '0',
  })
  if (options?.countryCodes) {
    params.set('countrycodes', options.countryCodes)
  }

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      'User-Agent': NOMINATIM_USER_AGENT,
      Accept: 'application/json',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Geocoding failed: HTTP ${res.status}`)
  }

  const data = (await res.json()) as NominatimRow[]
  if (!Array.isArray(data)) return []
  return mapNominatimResults(data)
}
