import { NextResponse } from 'next/server'
import {
  importCompetitionResultsAdmin,
  parseUploadToRows,
  type AdminImportRow,
} from '@/lib/admin-competition-import'
import { requireAdminApi } from '@/lib/admin-api-auth'

type RouteParams = { params: Promise<{ competitionSlug: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireAdminApi(request)
  if (auth instanceof NextResponse) return auth

  const { competitionSlug } = await params
  const slug = competitionSlug.trim().toLowerCase()
  if (!slug) {
    return NextResponse.json({ ok: false, error: 'Missing competition slug' }, { status: 400 })
  }

  const reqUrl = new URL(request.url)
  const dryRun = reqUrl.searchParams.get('dry_run') === '1'
  const runScoring = reqUrl.searchParams.get('run_scoring') !== '0'

  const contentType = request.headers.get('content-type') ?? ''
  let rows

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json({ ok: false, error: 'Missing file upload' }, { status: 400 })
      }
      const buffer = await file.arrayBuffer()
      const name = file instanceof File ? file.name : 'upload.csv'
      const sheetName = String(form.get('sheet_name') ?? '').trim() || undefined
      rows = parseUploadToRows(buffer, name, slug, sheetName)
    } else {
      const body = (await request.json()) as { rows?: unknown[] }
      if (!Array.isArray(body.rows)) {
        return NextResponse.json({ ok: false, error: 'Expected multipart file or JSON { rows }' }, { status: 400 })
      }
      rows = body.rows as AdminImportRow[]
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not parse upload'
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }

  if (!rows.length) {
    return NextResponse.json({ ok: false, error: 'No data rows found in upload' }, { status: 400 })
  }

  const result = await importCompetitionResultsAdmin(auth.supabase, slug, rows, {
    dryRun,
    runScoring: dryRun ? false : runScoring,
  })

  return NextResponse.json({
    ok: result.errors.length === 0 || result.updated > 0,
    dry_run: dryRun,
    competition_slug: slug,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped,
    scored: result.scored ?? 0,
    scoring_errors: result.scoring_errors ?? [],
    errors: result.errors,
    preview: result.preview,
    row_count: rows.length,
  })
}
