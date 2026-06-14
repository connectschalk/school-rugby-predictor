import { normalizeTeamKey, normalizeTeamKeyLoose } from '@/lib/team-name-match'

const LOGO_BY_NORMALIZED_KEY = new Map<string, string>()

function reg(slug: string, names: string[]) {
  const path = `/craven-week-team-logos/${slug}.png`
  for (const n of names) {
    LOGO_BY_NORMALIZED_KEY.set(normalizeTeamKey(n), path)
    LOGO_BY_NORMALIZED_KEY.set(normalizeTeamKeyLoose(n), path)
  }
}

reg('blue-bulls', ['Blue Bulls', 'Blue Bulls Rugby', 'BUL', 'Pretoria'])
reg('limpopo', ['Limpopo', 'Limpopo Bulls', 'Limpopo Blue Bulls', 'LIM'])
reg('valke', ['Valke', 'Valke Rugby', 'Falcons', 'VAL'])
reg('lions', ['Lions', 'Golden Lions', 'Gauteng Lions', 'GP Lions'])
reg('griffons', ['Griffons', 'Griffons Rugby'])
reg('sharks', ['Sharks', 'The Sharks', 'Sharks Durban', 'KwaZulu-Natal', 'KZN', 'Durban'])
reg('western-province', ['Western Province', 'WP', 'W.P. Rugby', 'W.P Rugby'])
reg('western-province-xv', ['Western Province XV', 'WP XV', 'Western Province U18 XV'])
reg('boland', ['Boland', 'Boland Rugby', 'BL'])
reg('swd-eagles', ['SWD Eagles', 'SWD', 'South Western Districts', 'South Western Districts Eagles'])
reg('eastern-province', ['Eastern Province', 'Eastern Cape', 'EPRU', 'EP'])
reg('border', ['Border', 'Border Rugby', 'B.R.U.', 'BRU'])
reg('cheetahs', ['Cheetahs', 'Free State Cheetahs', 'Free State'])
reg('griquas', ['Griquas', 'Northern Cape'])
reg('pumas', ['Pumas', 'PUM', 'Mpumalanga'])
reg('leopards', ['Leopards', 'Luiperds Leopards', 'Luiperds Leopards Rugby', 'LEO'])
reg('zimbabwe', ['Zimbabwe', 'Zimbabwe Rugby', 'ZIM'])

/** Craven Week provincial union names for admin fixture picker. */
export const CRAVEN_WEEK_TEAM_NAMES = [
  'Blue Bulls',
  'Limpopo Blue Bulls',
  'Valke',
  'Lions',
  'Griffons',
  'Sharks',
  'Western Province',
  'Western Province XV',
  'Boland',
  'SWD Eagles',
  'Eastern Province',
  'Border',
  'Cheetahs',
  'Griquas',
  'Pumas',
  'Leopards',
  'Zimbabwe',
] as const

export function getCravenWeekTeamLogoPath(rawName: string): string | null {
  const t = rawName?.trim()
  if (!t) return null
  const k = normalizeTeamKey(t)
  const hit = LOGO_BY_NORMALIZED_KEY.get(k)
  if (hit) return hit
  const loose = normalizeTeamKeyLoose(t)
  const hit2 = LOGO_BY_NORMALIZED_KEY.get(loose)
  if (hit2) return hit2
  const slugish = normalizeTeamKey(t.replace(/-/g, ' '))
  return LOGO_BY_NORMALIZED_KEY.get(slugish) ?? null
}
