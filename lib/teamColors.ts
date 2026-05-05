import { normalizeTeamKey } from '@/lib/team-name-match'

/** Team display name (Teams/fixtures) -> primary brand color. */
export const TEAM_COLORS: Record<string, string> = {
  'Paul Roos': '#8E1B1B',
  'Paarl Boys High': '#1E3A8A',
  'Paarl Gimnasium': '#166534',
  'Grey College': '#1D3557',
  'Durban High': '#1E40AF',
  'Afrikaans Hoer Seuns': '#1E3A8A',
  'Afrikaans Hoër Seuns': '#1E3A8A',
  'Maritzburg College': '#0F172A',
  'Northwood': '#0F172A',
  'Glenwood': '#166534',
  'Westville': '#374151',
  'Oakdale': '#92400E',
  'Outeniqua': '#0F766E',
  'Rondebosch': '#1D4ED8',
  'SACS': '#111827',
  'Bishops': '#7F1D1D',
  'Wynberg': '#111827',
  'Garsfontein': '#0E7490',
  'Monument': '#B45309',
  'Waterkloof': '#0F766E',
  'Noordheuwel': '#BE123C',
}

const TEAM_COLORS_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_COLORS).map(([name, color]) => [normalizeTeamKey(name), color])
)

export function getTeamColor(teamName: string): string | undefined {
  return TEAM_COLORS_NORMALIZED[normalizeTeamKey(teamName)]
}

export function getLightTint(hex: string): string {
  return `${hex}20`
}
