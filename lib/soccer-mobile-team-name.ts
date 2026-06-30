/** Mobile-only short labels for long soccer team names on prediction cards. */
export function getMobileTeamName(name: string): string {
  const normalized = name.trim().toLowerCase()

  const shortNames: Record<string, string> = {
    'democratic republic of congo': 'Congo',
    'dr congo': 'Congo',
    drc: 'Congo',
    'bosnia and herzegovina': 'Bosnia',
    'bosnia & herzegovina': 'Bosnia',
  }

  return shortNames[normalized] ?? name
}
