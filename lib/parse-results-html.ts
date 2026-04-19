/**
 * Server-only: extract score lines from arbitrary rugby results HTML.
 * Consumed by `app/api/parse-results-url/route.ts`.
 */

import * as cheerio from 'cheerio'

export type ParsedResultRow = {
  team_a_name: string
  team_b_name: string
  team_a_score: number
  team_b_score: number
}

function normalizeDashes(line: string): string {
  return line
    .replace(/[\u2013\u2014\u2212\u2010]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Try patterns: "A 24-17 B", "A 24 – 17 B", "A 24 vs 17 B"
 */
export function tryParseScoreLine(line: string): ParsedResultRow | null {
  const n = normalizeDashes(line)
  if (n.length < 5) return null

  const patterns: RegExp[] = [
    /^(.+?)\s+(\d{1,3})\s*-\s*(\d{1,3})\s+(.+)$/,
    /^(.+?)\s+(\d{1,3})\s+vs\.?\s+(\d{1,3})\s+(.+)$/i,
  ]

  for (const re of patterns) {
    const m = n.match(re)
    if (!m) continue
    const teamA = m[1].trim()
    const sa = Number(m[2])
    const sb = Number(m[3])
    const teamB = m[4].trim()
    if (!teamA || !teamB || Number.isNaN(sa) || Number.isNaN(sb)) continue
    if (sa < 0 || sb < 0 || sa > 200 || sb > 200) continue
    return {
      team_a_name: teamA,
      team_b_name: teamB,
      team_a_score: sa,
      team_b_score: sb,
    }
  }
  return null
}

function extractTextBlocks($: cheerio.CheerioAPI): string[] {
  const selectors = [
    'article',
    '.entry-content',
    '.post-content',
    'main article',
    'main',
    '#content',
  ]
  for (const sel of selectors) {
    const el = $(sel).first()
    if (el.length) {
      return el
        .text()
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return $('body')
    .text()
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function extractTableRows($: cheerio.CheerioAPI): string[] {
  const out: string[] = []
  $('table tr').each((_, tr) => {
    const cells = $(tr)
      .find('td,th')
      .map((__, td) => $(td).text().trim())
      .get()
      .filter(Boolean)
    if (cells.length >= 4) {
      const joined = cells.join(' ')
      out.push(joined)
    }
  })
  return out
}

function extractIsoDateFromHtml($: cheerio.CheerioAPI): string | null {
  const timeDt = $('time[datetime]').first().attr('datetime')
  if (timeDt && /^\d{4}-\d{2}-\d{2}/.test(timeDt)) {
    return timeDt.slice(0, 10)
  }
  const pub = $('meta[property="article:published_time"]').attr('content')
  if (pub && /^\d{4}-\d{2}-\d{2}/.test(pub)) {
    return pub.slice(0, 10)
  }
  const og = $('meta[property="og:updated_time"]').attr('content')
  if (og && /^\d{4}-\d{2}-\d{2}/.test(og)) {
    return og.slice(0, 10)
  }
  return null
}

function extractDateFromTextBlob(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
  return null
}

export type ParseResultsFromHtmlResult = {
  rows: ParsedResultRow[]
  pageDate: string | null
  notes: string[]
}

export function parseResultsFromHtml(html: string): ParseResultsFromHtmlResult {
  const $ = cheerio.load(html)
  const notes: string[] = []

  let pageDate = extractIsoDateFromHtml($)
  const lineSources: string[] = [...extractTextBlocks($), ...extractTableRows($)]

  const fullText = lineSources.join('\n')
  if (!pageDate) {
    pageDate = extractDateFromTextBlob(fullText)
    if (pageDate) notes.push('Derived date from page text (no <time> meta).')
  } else {
    notes.push('Used structured date from page (time/meta).')
  }

  const seen = new Set<string>()
  const rows: ParsedResultRow[] = []

  for (const line of lineSources) {
    const parsed = tryParseScoreLine(line)
    if (!parsed) continue
    const key = `${parsed.team_a_name}|${parsed.team_a_score}|${parsed.team_b_score}|${parsed.team_b_name}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(parsed)
  }

  if (!rows.length) {
    notes.push('No score lines matched patterns (Team 24-17 Team). Try another page or paste-friendly format.')
  }

  return { rows, pageDate, notes }
}
