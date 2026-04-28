'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchUserIsAdmin } from '@/lib/admin-access'

type AdminPoolRow = {
  id: string
  name: string
  admin_user_id: string
  admin_display_name: string | null
  member_count: number
  selected_groups: string[]
  created_at: string
  is_closed: boolean
}

type PoolStatusFilter = 'all' | 'open' | 'closed'

export default function AdminGlobalPoolsPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [query, setQuery] = useState('')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pools, setPools] = useState<AdminPoolRow[]>([])
  const [statusFilter, setStatusFilter] = useState<PoolStatusFilter>('open')
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [closingPoolId, setClosingPoolId] = useState<string | null>(null)

  const loadPools = useCallback(async (search: string) => {
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('admin_search_pools', {
      p_search: search.trim(),
      p_limit: 100,
    })
    if (error) {
      setPools([])
      setMessage(`Could not load pools: ${error.message}`)
    } else {
      setPools(((data as AdminPoolRow[] | null) ?? []).map((row) => ({ ...row, selected_groups: row.selected_groups ?? [] })))
      setSelectedPoolId((prev) => prev ?? (((data as AdminPoolRow[] | null) ?? [])[0]?.id ?? null))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user) {
        router.replace('/login')
        return
      }
      const { isAdmin, error } = await fetchUserIsAdmin(supabase, session.user.id)
      if (error || !isAdmin) {
        router.replace('/predict-score')
        return
      }
      setAuthChecked(true)
      await loadPools('')
    }
    void checkAccess()
  }, [loadPools, router])

  const totalCount = pools.length
  const openCount = useMemo(() => pools.filter((p) => !p.is_closed).length, [pools])
  const closedCount = useMemo(() => pools.filter((p) => p.is_closed).length, [pools])

  const filteredPools = useMemo(() => {
    if (statusFilter === 'open') return pools.filter((p) => !p.is_closed)
    if (statusFilter === 'closed') return pools.filter((p) => p.is_closed)
    return pools
  }, [pools, statusFilter])

  useEffect(() => {
    if (!filteredPools.some((p) => p.id === selectedPoolId)) {
      setSelectedPoolId(filteredPools[0]?.id ?? null)
    }
  }, [filteredPools, selectedPoolId])

  const selectedPool = useMemo(
    () => filteredPools.find((p) => p.id === selectedPoolId) ?? null,
    [filteredPools, selectedPoolId]
  )

  async function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSearchText(query.trim())
    await loadPools(query.trim())
  }

  async function onClosePool(poolId: string) {
    const confirmed = window.confirm(
      'Close this pool? Members will lose access, but history is preserved.'
    )
    if (!confirmed) return
    setClosingPoolId(poolId)
    setMessage('')
    const { error } = await supabase.rpc('admin_close_pool', { p_pool_id: poolId })
    if (error) {
      setMessage(`Could not close pool: ${error.message}`)
      setClosingPoolId(null)
      return
    }
    setMessage('Pool closed.')
    await loadPools(searchText)
    setClosingPoolId(null)
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <p>Checking access...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Global pools management</h1>
            <p className="mt-1 text-sm text-gray-600">Search pools, inspect details, and close pools safely.</p>
          </div>
          <Link href="/admin" className="text-sm text-blue-600 underline hover:text-blue-800">
            Back to Admin
          </Link>
        </div>

        <form onSubmit={onSearchSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pools by name"
            className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section className="rounded-2xl border border-gray-200 p-4">
            <h2 className="text-base font-semibold">Pools</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                  statusFilter === 'all'
                    ? 'border-black bg-black text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('open')}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                  statusFilter === 'open'
                    ? 'border-black bg-black text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Open only
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('closed')}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                  statusFilter === 'closed'
                    ? 'border-red-700 bg-red-700 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Closed only
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-600">
              Open: {openCount} · Closed: {closedCount} · Total: {totalCount}
            </p>
            <div className="mt-3 space-y-2">
              {filteredPools.length === 0 ? (
                <p className="text-sm text-gray-600">No pools found.</p>
              ) : (
                filteredPools.map((pool) => (
                  <button
                    key={pool.id}
                    type="button"
                    onClick={() => setSelectedPoolId(pool.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                      selectedPoolId === pool.id ? 'border-black bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{pool.name}</span>
                      <span className={`text-xs ${pool.is_closed ? 'text-red-700' : 'text-green-700'}`}>
                        {pool.is_closed ? 'Closed' : 'Open'}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 p-4">
            <h2 className="text-base font-semibold">Pool details</h2>
            {!selectedPool ? (
              <p className="mt-3 text-sm text-gray-600">Select a pool to view details.</p>
            ) : (
              <div className="mt-3 space-y-2 text-sm">
                <p><span className="font-medium">Pool name:</span> {selectedPool.name}</p>
                <p><span className="font-medium">Admin/owner:</span> {selectedPool.admin_display_name || 'Unknown'}</p>
                <p><span className="font-medium">Member count:</span> {selectedPool.member_count}</p>
                <p>
                  <span className="font-medium">Selected groups:</span>{' '}
                  {selectedPool.selected_groups.length > 0 ? selectedPool.selected_groups.join(', ') : '—'}
                </p>
                <p><span className="font-medium">Created date:</span> {new Date(selectedPool.created_at).toLocaleString()}</p>
                <p>
                  <span className="font-medium">Status:</span>{' '}
                  <span className={selectedPool.is_closed ? 'text-red-700' : 'text-green-700'}>
                    {selectedPool.is_closed ? 'Closed' : 'Open'}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => void onClosePool(selectedPool.id)}
                  disabled={selectedPool.is_closed || closingPoolId === selectedPool.id}
                  className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {closingPoolId === selectedPool.id ? 'Closing...' : 'Close pool'}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
