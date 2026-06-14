'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import MasterSheetSyncWarningsPanel from '@/components/admin/MasterSheetSyncWarningsPanel'
import { normalizeSyncWarningsInput } from '@/lib/sync-master-warnings'

type SheetSyncOpMode = 'sync' | 'sync_all' | 'new_upcoming' | 'new_scores'

export default function SchoolsSheetSyncPanel() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<ReturnType<typeof normalizeSyncWarningsInput>>([])

  async function runSync(op: SheetSyncOpMode, preview: boolean) {
    setMessage('')
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setMessage('Not signed in.')
      return
    }

    setBusy(`${op}-${preview ? 'preview' : 'live'}`)
    try {
      const params = new URLSearchParams()
      params.set('sync_mode', op)
      if (preview) params.set('dry_run', '1')
      const res = await fetch(`/api/admin/sync-master-sheet?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = (await res.json()) as Record<string, unknown>
      setWarnings(normalizeSyncWarningsInput(json.warnings ?? json.validation_errors))
      if (!res.ok || !json.ok) {
        setMessage(String(json.error ?? res.statusText ?? 'Sync failed'))
        return
      }
      if (preview) {
        setMessage(
          `Preview (${op}): would insert ${json.would_insert_upcoming ?? json.planned_inserts ?? 0} upcoming, update ${json.would_update_upcoming ?? json.planned_updates ?? 0} upcoming.`
        )
      } else {
        setMessage(
          `Sync complete: game_matches inserted/updated ${json.game_matches_inserted ?? 0}/${json.game_matches_updated ?? 0}. Scoring is a separate step (Results tab or /admin hub).`
        )
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <h3 className="text-base font-bold text-gray-900">School Rugby — Google Sheet sync</h3>
      <p className="mt-2 text-sm text-gray-600">
        Existing Schools import via Teams + Fixtures CSV URLs. All rows are stamped with{' '}
        <code className="rounded bg-gray-100 px-1">nextplay-schools</code> automatically.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ['new_upcoming', 'New upcoming (preview)', true],
            ['new_upcoming', 'New upcoming (run)', false],
            ['new_scores', 'New scores (preview)', true],
            ['new_scores', 'New scores (run)', false],
            ['sync', 'Full sync (preview)', true],
            ['sync', 'Full sync (run)', false],
          ] as const
        ).map(([op, label, preview]) => (
          <button
            key={`${op}-${preview}`}
            type="button"
            disabled={!!busy}
            onClick={() => void runSync(op, preview)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === `${op}-${preview ? 'preview' : 'live'}` ? '…' : label}
          </button>
        ))}
      </div>
      {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}
      {warnings.length > 0 ? (
        <div className="mt-4">
          <MasterSheetSyncWarningsPanel items={warnings} defaultOpen={warnings.length > 0} />
        </div>
      ) : null}
      <p className="mt-3 text-xs text-gray-500">
        Advanced tools (predictor studio, legacy XLSX) remain on{' '}
        <a href="/admin" className="font-semibold text-red-700 underline">
          /admin
        </a>
        .
      </p>
    </section>
  )
}
