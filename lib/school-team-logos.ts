import { normalizeTeamKey, normalizeTeamKeyLoose } from '@/lib/team-name-match'

/**
 * Static crests in /public/team-logos/{slug}.png — aligned to common `teams.name`
 * and `game_matches` free-text school names.
 */
const LOGO_BY_NORMALIZED_KEY = new Map<string, string>()

function reg(slug: string, names: string[]) {
  const path = `/team-logos/${slug}.png`
  for (const n of names) {
    LOGO_BY_NORMALIZED_KEY.set(normalizeTeamKey(n), path)
    LOGO_BY_NORMALIZED_KEY.set(normalizeTeamKeyLoose(n), path)
  }
}

reg('afrikaans-hoe_r-seuns', [
  'Afrikaans Hoër Seuns',
  'Afrikaans Hoer Seuns',
  'Affies',
])
reg('bishops', ['Bishops', 'Diocesan College', 'Bishops Diocesan College'])
reg('ben-vorster', ['Ben Vorster', 'Hoërskool Ben Vorster', 'Hoerskool Ben Vorster'])
reg('bergsig', ['Bergsig', 'Hoërskool Bergsig', 'Hoerskool Bergsig'])
reg('boland-landbou', [
  'Hoër Landbouskool Boland',
  'Hoer Landbouskool Boland',
  'Boland Landbou',
  'Landbouskool Boland',
])
reg('brackenfell', ['Brackenfell', 'Hoërskool Brackenfell'])
reg('dale-college', ['Dale College', 'Dale'])
reg('diamantveld', ['Diamantveld', 'Hoërskool Diamantveld'])
reg('die-anker', ['Die Anker', 'Hoërskool Die Anker', 'Hoerskool Die Anker', 'Anker'])
reg('duineveld', ['Duineveld'])
reg('durban-high', ['Durban High', 'Durban High School', 'DHS'])
reg('durbanville', ['Durbanville', 'Hoërskool Durbanville'])
reg('eg-jansen', ['EG Jansen', 'E G Jansen', 'E.G. Jansen', 'Hoërskool EG Jansen'])
reg('eldoraigne', ['Eldoraigne', 'Hoërskool Eldoraigne'])
reg('fichardtpark', ['Fichardtpark', 'Fichardt Park', 'Hoërskool Fichardtpark'])
reg('frikkie-meyer', ['Frikkie Meyer', 'Hoërskool Frikkie Meyer'])
reg('garsfontein', ['Garsfontein', 'Hoërskool Garsfontein', 'Hoerskool Garsfontein'])
reg('glenwood', ['Glenwood', 'Glenwood High School'])
reg('grey-college', ['Grey College', 'Grey College Bloemfontein'])
reg('grey-high', ['Grey High School', 'Grey High', 'Grey HS'])
reg('grey-pe', ['Grey PE', 'Grey High PE', 'Grey High School PE'])
reg('helpmekaar', ['Helpmekaar', 'Hoërskool Helpmekaar'])
reg('heidelberg', ['Heidelberg', 'Hoërskool Heidelberg', 'Hoerskool Heidelberg'])
reg('hilton', ['Hilton College', 'Hilton'])
reg('hts-belville', ['HTS Bellville', 'Bellville HTS', 'Hoërskool Bellville'])
reg('hts-drostdy', ['HTS Drostdy', 'Hoërskool Drostdy'])
reg('hts-middelburg', ['HTS Middelburg', 'Hoërskool Middelburg'])
reg('hudson-park', ['Hudson Park', 'Hudson Park High'])
reg('jeppe', ['Jeppe', 'Jeppe High School for Boys', 'Jeppe High'])
reg('kemptonpark', ['Kempton Park', 'Kemptonpark', 'Hoërskool Kemptonpark'])
reg('kes', ['KES', 'King Edward VII School', 'King Edward VII'])
reg('kearsney', ['Kearsney', 'Kearsney College'])
reg('kingswood', ['Kingswood', 'Kingswood College'])
reg('ligbron', ['Ligbron', 'Hoërskool Ligbron'])
reg('marlow', ['Marlow', 'Marlow Landbou'])
reg('marais-viljoen', ['Marais Viljoen', 'Hoërskool Marais Viljoen', 'Hoerskool Marais Viljoen'])
reg('maritzburg-college', ['Maritzburg College', 'Maritzburg'])
reg('menlopark', ['Menlo Park', 'Menlopark', 'Hoërskool Menlo Park', 'Hoërskool Menlopark'])
reg('michealhouse', ['Michaelhouse', 'Michealhouse'])
reg('milnerton', ['Milnerton', 'Hoërskool Milnerton'])
reg('monument', ['Monument', 'Hoërskool Monument', 'Monnas'])
reg('muir', ['Muir', 'Muir College'])
reg('nelspruit', ['Nelspruit', 'Hoërskool Nelspruit', 'Nelspruit Hoër'])
reg('nico-malan', ['Nico Malan', 'Hoërskool Nico Malan', 'Hoerskool Nico Malan'])
reg('nothwood', ['Northwood', 'Northwood Boys', 'Northwood Boys High School'])
reg('noordheuwel', ['Noordheuwel', 'Hoërskool Noordheuwel'])
reg('oakdale', ['Oakdale', 'Oakdale Landbou'])
reg('outeniqua', ['Outeniqua', 'Hoërskool Outeniqua'])
reg('paarl-boys', ['Paarl Boys High', 'Paarl Boys'])
reg('paarl-gim', ['Paarl Gimnasium', 'Paarl Gim'])
reg('paul-roos', ['Paul Roos Gymnasium', 'Paul Roos', 'PRG'])
reg('potch-gim', ['Potchefstroom Gimnasium', 'Potch Gim', 'Potchefstroom Gim'])
reg('pietersburg', ['Pietersburg', 'Hoërskool Pietersburg', 'Hoerskool Pietersburg'])
reg('queens', ['Queens', "Queen's College"])
reg('randburg', ['Randburg', 'Hoërskool Randburg', 'Hoerskool Randburg'])
reg('rondebosch', ['Rondebosch', 'Rondebosch Boys', 'Rondebosch Boys High School'])
reg('rustenburg', ['Rustenburg', 'Hoërskool Rustenburg'])
reg('sacs', ['SACS', 'South African College Schools'])
reg('selborne-college', ['Selborne College', 'Selborne'])
reg('sentraal', ['Sentraal', 'Hoërskool Sentraal', 'Hoerskool Sentraal'])
reg('st-andrews', ["St Andrew's", 'St Andrews', "St. Andrew's"])
reg('st-charles', ['St Charles', "St Charles College", "St. Charles College"])
reg('st-stithians', ['St Stithians', "St Stithians College", 'St Stithians Boys'])
reg('stellenberg', [
  'Stellenberg',
  'Hoërskool Stellenberg',
  'Stellenburg',
  'Hoërskool Stellenburg',
])
reg('strand', ['Strand', 'Hoërskool Strand'])
reg('swartland', ['Swartland', 'Hoërskool Swartland'])
reg('trio', ['TRIO', 'Trio'])
reg('tygerberg', ['Tygerberg', 'Hoërskool Tygerberg'])
reg('voortrekker', ['Voortrekker', 'Hoërskool Voortrekker'])
reg('wagpos', ['Wagpos', 'Die Hoërskool Wagpos', 'Hoërskool Wagpos'])
reg('waterkloof', ['Waterkloof', 'Hoërskool Waterkloof'])
reg('welkom-gim', ['Welkom Gimnasium', 'Welkom-Gimnasium', 'Welkom Gim'])
reg('westville', ['Westville', 'Westville Boys High', 'Westville Boys'])
reg('worcester-gim', ['Worcester Gimnasium', 'Worcester Gim', 'Hoërskool Worcester Gimnasium'])
reg('wynberg', ['Wynberg', 'Wynberg Boys High', 'Wynberg Boys'])
reg('zwartkop', ['Zwartkop', 'Hoërskool Zwartkop'])

/**
 * Public URL path for Next.js `/public` (leading slash).
 */
export function getSchoolTeamLogoPath(rawName: string): string | null {
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
