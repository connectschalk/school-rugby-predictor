/**
 * Import competition fixtures from a JSON file.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/import-competition-fixtures.ts path/to/fixtures.json
 *
 * JSON format: CompetitionFixtureInput[] — see lib/competition-fixture-ingest.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  importCompetitionFixtures,
  type CompetitionFixtureInput,
} from '../lib/competition-fixture-ingest'

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: npx tsx scripts/import-competition-fixtures.ts <fixtures.json>')
    process.exit(1)
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const raw = readFileSync(resolve(filePath), 'utf8')
  const inputs = JSON.parse(raw) as CompetitionFixtureInput[]
  if (!Array.isArray(inputs) || inputs.length === 0) {
    console.error('fixtures.json must be a non-empty array')
    process.exit(1)
  }

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await importCompetitionFixtures(client, inputs)

  console.log(`Inserted: ${result.inserted}`)
  console.log(`Skipped (duplicate): ${result.skipped}`)
  if (result.errors.length) {
    console.error('Errors:')
    for (const err of result.errors) console.error(`  - ${err}`)
    process.exit(1)
  }
}

void main()
