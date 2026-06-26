'use client'

import { useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import PoolLogo from '@/components/pools/PoolLogo'
import { canShowPoolLogoUpload } from '@/lib/pool-logo'
import type { PoolRow } from '@/lib/pools'

type Props = {
  client: SupabaseClient
  pool: PoolRow
  canManagePool: boolean
  onPoolUpdated: (pool: PoolRow) => void
}

export default function PoolLogoUploadSection({
  client,
  pool,
  canManagePool,
  onPoolUpdated,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (!canShowPoolLogoUpload(canManagePool)) {
    return null
  }

  async function onFileSelected(file: File | null) {
    if (!file) return
    setBusy(true)
    setMessage('')
    setError('')

    const {
      data: { session },
    } = await client.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setError('Not signed in.')
      setBusy(false)
      return
    }

    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/pools/${pool.id}/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })

    let json: { error?: string; pool?: PoolRow } = {}
    try {
      json = (await res.json()) as { error?: string; pool?: PoolRow }
    } catch {
      setError('Could not save pool logo.')
      setBusy(false)
      return
    }

    setBusy(false)

    if (!res.ok || !json.pool) {
      setError(json.error ?? 'Could not save pool logo.')
      return
    }

    onPoolUpdated(json.pool)
    setMessage('Pool logo updated.')
  }

  return (
    <section className="border-t border-gray-100 pt-4">
      <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Pool logo</h3>
      <p className="mt-1 text-sm text-gray-600">
        Upload a logo that will appear on the pool invite, pool page, and pool list.
      </p>
      <p className="mt-1 text-xs text-gray-500">Square PNG, JPG, JPEG, or WebP. Max 2 MB.</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <PoolLogo logoUrl={pool.logo_url} name={pool.name} size="lg" />
        <div className="flex min-w-0 flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              void onFileSelected(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Uploading…' : pool.logo_url ? 'Change logo' : 'Upload logo'}
          </button>
        </div>
      </div>

      {message ? <p className="mt-3 text-sm font-medium text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-800">{error}</p> : null}
    </section>
  )
}
