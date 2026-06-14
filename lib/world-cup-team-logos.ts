import { normalizeTeamKey, normalizeTeamKeyLoose } from '@/lib/team-name-match'

const LOGO_BY_NORMALIZED_KEY = new Map<string, string>()

function reg(slug: string, names: string[]) {
  const path = `/world-cup-team-logos/${slug}.png`
  for (const n of names) {
    LOGO_BY_NORMALIZED_KEY.set(normalizeTeamKey(n), path)
    LOGO_BY_NORMALIZED_KEY.set(normalizeTeamKeyLoose(n), path)
  }
}

reg('algeria', ['Algeria', 'ALG'])
reg('argentina', ['Argentina', 'ARG'])
reg('australia', ['Australia', 'AUS'])
reg('austria', ['Austria', 'AUT'])
reg('belgium', ['Belgium', 'BEL'])
reg('bosnia-and-herzegovina', ['Bosnia and Herzegovina', 'Bosnia', 'BIH'])
reg('brazil', ['Brazil', 'BRA'])
reg('canada', ['Canada', 'CAN'])
reg('cape-verde', ['Cape Verde', 'CPV'])
reg('chile', ['Chile', 'CHI'])
reg('colombia', ['Colombia', 'COL'])
reg('croatia', ['Croatia', 'CRO'])
reg('curacao', ['Curaçao', 'Curacao', 'CUW'])
reg('czech-republic', ['Czech Republic', 'Czechia', 'CZE'])
reg('democratic-republic-of-congo', [
  'Democratic Republic of Congo',
  'DR Congo',
  'Congo DR',
  'COD',
])
reg('ecuador', ['Ecuador', 'ECU'])
reg('egypt', ['Egypt', 'EGY'])
reg('england', ['England', 'ENG'])
reg('france', ['France', 'FRA'])
reg('germany', ['Germany', 'GER'])
reg('ghana', ['Ghana', 'GHA'])
reg('haiti', ['Haiti', 'HAI'])
reg('iran', ['Iran', 'IRN', 'IR Iran'])
reg('iraq', ['Iraq', 'IRQ'])
reg('ivory-coast', ["Côte d'Ivoire", 'Cote d Ivoire', 'Ivory Coast', 'CIV'])
reg('japan', ['Japan', 'JPN'])
reg('jordan', ['Jordan', 'JOR'])
reg('mexico', ['Mexico', 'MEX'])
reg('morocco', ['Morocco', 'MAR'])
reg('netherlands', ['Netherlands', 'NED', 'Holland'])
reg('new-zealand', ['New Zealand', 'NZL'])
reg('norway', ['Norway', 'NOR'])
reg('panama', ['Panama', 'PAN'])
reg('paraguay', ['Paraguay', 'PAR'])
reg('poland', ['Poland', 'POL'])
reg('portugal', ['Portugal', 'POR'])
reg('qatar', ['Qatar', 'QAT'])
reg('saudi-arabia', ['Saudi Arabia', 'KSA', 'SAU'])
reg('scotland', ['Scotland', 'SCO'])
reg('senegal', ['Senegal', 'SEN'])
reg('south-africa', ['South Africa', 'RSA', 'ZAF'])
reg('south-korea', ['South Korea', 'Korea Republic', 'KOR', 'Republic of Korea'])
reg('spain', ['Spain', 'ESP'])
reg('sweden', ['Sweden', 'SWE'])
reg('switzerland', ['Switzerland', 'SUI'])
reg('thailand', ['Thailand', 'THA'])
reg('tunisia', ['Tunisia', 'TUN'])
reg('turkey', ['Turkey', 'Türkiye', 'TUR'])
reg('united-states', ['United States', 'USA', 'US', 'United States of America'])
reg('uruguay', ['Uruguay', 'URU'])
reg('uzbekistan', ['Uzbekistan', 'UZB'])
reg('vietnam', ['Vietnam', 'VIE'])

/** All known World Cup team display names (for admin pickers). */
export const WORLD_CUP_TEAM_NAMES = [
  'Algeria',
  'Argentina',
  'Australia',
  'Austria',
  'Belgium',
  'Bosnia and Herzegovina',
  'Brazil',
  'Canada',
  'Cape Verde',
  'Chile',
  'Colombia',
  'Croatia',
  'Curaçao',
  'Czech Republic',
  'Democratic Republic of Congo',
  'Ecuador',
  'Egypt',
  'England',
  'France',
  'Germany',
  'Ghana',
  'Haiti',
  'Iran',
  'Iraq',
  "Côte d'Ivoire",
  'Japan',
  'Jordan',
  'Mexico',
  'Morocco',
  'Netherlands',
  'New Zealand',
  'Norway',
  'Panama',
  'Paraguay',
  'Poland',
  'Portugal',
  'Qatar',
  'Saudi Arabia',
  'Scotland',
  'Senegal',
  'South Africa',
  'South Korea',
  'Spain',
  'Sweden',
  'Switzerland',
  'Thailand',
  'Tunisia',
  'Türkiye',
  'United States',
  'Uruguay',
  'Uzbekistan',
  'Vietnam',
] as const

export function getWorldCupTeamLogoPath(rawName: string): string | null {
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
