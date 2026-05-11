/** Calendar date (YYYY-MM-DD) in Africa/Johannesburg for an ISO instant. */
export function dateInSastFromIso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(d)
}
