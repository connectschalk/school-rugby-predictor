'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { adminImportKickoffDisplay, type AdminImportRow } from '@/lib/admin-competition-import'

type ImportKind = 'fixtures' | 'results'

type Props = {
  competitionSlug: string
  kind: ImportKind
  onSuccess?: () => void | Promise<void>
}

type ImportResponse = {
  ok?: boolean
  error?: string
  dry_run?: boolean
  inserted?: number
  updated?: number
  skipped?: number
  scored?: number
  scoring_errors?: string[]
  errors?: string[]
  preview?: AdminImportRow[]
  row_count?: number
}

export default function CompetitionImportPanel({ competitionSlug, kind, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ImportResponse | null>(null)
  const [message, setMessage] = useState('')

  const endpoint =
    kind === 'fixtures'
      ? `/api/admin/competitions/${competitionSlug}/fixtures/import`
      : `/api/admin/competitions/${competitionSlug}/results/import`

  async function upload(dryRun: boolean) {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setMessage('Choose a CSV or XLSX file first.')
      return
    }
    setBusy(true)
    setMessage('')
    setSummary(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setMessage('Not signed in.')
        return
      }
      const form = new FormData()
      form.append('file', file)
      const params = new URLSearchParams()
      if (dryRun) params.set('dry_run', '1')
      if (kind === 'results' && !dryRun) params.set('run_scoring', '1')
      const res = await fetch(`${endpoint}?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const json = (await res.json()) as ImportResponse
      setSummary(json)
      if (!res.ok) {
        setMessage(json.error ?? 'Import failed')
        return
      }
      if (!json.ok) {
        const errCount = json.errors?.length ?? 0
        setMessage(
          errCount > 0
            ? `Import failed — ${errCount} error${errCount === 1 ? '' : 's'} (see list below).`
            : json.error ?? 'Import failed'
        )
        return
      }
      setMessage(
        dryRun
          ? `Preview: ${json.row_count ?? 0} rows parsed.`
          : `Done — inserted ${json.inserted ?? 0}, updated ${json.updated ?? 0}, skipped ${json.skipped ?? 0}` +
              (kind === 'results' && json.scored != null ? `, scored ${json.scored}` : '')
      )
      if (!dryRun && onSuccess) await onSuccess()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-gray-900">
        {kind === 'fixtures' ? 'Upload fixtures' : 'Upload results'}
      </h3>
      <p className="mt-2 text-sm text-gray-600">
        CSV or XLSX for <strong>{competitionSlug}</strong> only.{' '}
        <code className="rounded bg-gray-100 px-1">competition_id</code> is stamped from the admin
        route — do not include it in the file. If <code className="rounded bg-gray-100 px-1">competition_slug</code>{' '}
        is present, it must match this competition.
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Columns: external_id, round, group, kickoff (or date + time / kickoff_time), home_team,
        away_team, venue, status
        {kind === 'results' ? ', home_score, away_score' : ''} (home_score/away_score optional on
        fixtures).
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="text-sm"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void upload(true)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void upload(false)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}
      {summary?.errors && summary.errors.length > 0 ? (
        <ul className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          {summary.errors.map((err) => (
            <li key={err} className="mt-1 first:mt-0">
              {err}
            </li>
          ))}
        </ul>
      ) : null}
      {summary?.scoring_errors && summary.scoring_errors.length > 0 ? (
        <ul className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {summary.scoring_errors.map((err) => (
            <li key={err} className="mt-1 first:mt-0">
              {err}
            </li>
          ))}
        </ul>
      ) : null}
      {summary?.preview && summary.preview.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">kickoff</th>
                <th className="py-1 pr-2">home</th>
                <th className="py-1 pr-2">away</th>
                <th className="py-1 pr-2">ext id</th>
              </tr>
            </thead>
            <tbody>
              {summary.preview.slice(0, 15).map((r) => (
                <tr key={r.rowNumber} className="border-b border-gray-100">
                  <td className="py-1 pr-2">{r.rowNumber}</td>
                  <td className="py-1 pr-2">{adminImportKickoffDisplay(r)}</td>
                  <td className="py-1 pr-2">{r.home_team}</td>
                  <td className="py-1 pr-2">{r.away_team}</td>
                  <td className="py-1 pr-2">{r.external_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
