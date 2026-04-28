'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchUserIsAdmin } from '@/lib/admin-access'

type GroupType = 'province' | 'league' | 'festival' | 'prestige' | 'custom'

type FixtureGroupRow = {
  id: string
  name: string
  slug: string
  group_type: GroupType
  is_active: boolean
  created_at: string
}

const GROUP_TYPE_OPTIONS: GroupType[] = ['province', 'league', 'festival', 'prestige', 'custom']

export default function AdminFixtureGroupsPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [groups, setGroups] = useState<FixtureGroupRow[]>([])
  const [name, setName] = useState('')
  const [groupType, setGroupType] = useState<GroupType>('custom')
  const [activeOnCreate, setActiveOnCreate] = useState(true)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('fixture_groups')
      .select('id, name, slug, group_type, is_active, created_at')
      .order('name', { ascending: true })
    if (error) {
      setMessage(`Could not load fixture groups: ${error.message}`)
      setGroups([])
    } else {
      setGroups((data as FixtureGroupRow[]) ?? [])
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
      await loadGroups()
    }
    void checkAccess()
  }, [loadGroups, router])

  async function onCreateGroup(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setMessage('Group name is required.')
      return
    }
    setSaving(true)
    setMessage('')
    const { data, error } = await supabase.rpc('admin_create_fixture_group', {
      p_name: trimmed,
      p_group_type: groupType,
    })
    if (error) {
      setMessage(`Could not create fixture group: ${error.message}`)
      setSaving(false)
      return
    }

    const created = ((data as FixtureGroupRow[] | null) ?? [])[0]
    if (created && !activeOnCreate) {
      const { error: toggleErr } = await supabase.rpc('admin_update_fixture_group', {
        p_group_id: created.id,
        p_is_active: false,
      })
      if (toggleErr) {
        setMessage(`Group created but could not set active state: ${toggleErr.message}`)
      }
    }

    setName('')
    setGroupType('custom')
    setActiveOnCreate(true)
    await loadGroups()
    setMessage('Fixture group saved.')
    setSaving(false)
  }

  async function onToggleActive(group: FixtureGroupRow) {
    setMessage('')
    const { error } = await supabase.rpc('admin_update_fixture_group', {
      p_group_id: group.id,
      p_is_active: !group.is_active,
    })
    if (error) {
      setMessage(`Could not update group: ${error.message}`)
      return
    }
    await loadGroups()
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
            <h1 className="text-3xl font-bold">Fixture groups / leagues</h1>
            <p className="mt-1 text-sm text-gray-600">Create and maintain province, league, festival, prestige, and custom groups.</p>
          </div>
          <Link href="/admin" className="text-sm text-blue-600 underline hover:text-blue-800">
            Back to Admin
          </Link>
        </div>

        <section className="mt-6 rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold">Create fixture group</h2>
          <form onSubmit={onCreateGroup} className="mt-3 grid gap-3 md:grid-cols-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            />
            <select
              value={groupType}
              onChange={(e) => setGroupType(e.target.value as GroupType)}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
            >
              {GROUP_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={activeOnCreate}
                onChange={(e) => setActiveOnCreate(e.target.checked)}
              />
              Active
            </label>
            <div className="md:col-span-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Create group'}
              </button>
            </div>
          </form>
        </section>

        {message ? <p className="mt-4 text-sm text-gray-700">{message}</p> : null}

        <section className="mt-6 rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold">Existing groups</h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Loading...</p>
          ) : groups.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">No groups found.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-700">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Slug</th>
                    <th className="py-2 pr-2">Created</th>
                    <th className="py-2">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id} className="border-b border-gray-100">
                      <td className="py-2 pr-2 font-medium">{g.name}</td>
                      <td className="py-2 pr-2">{g.group_type}</td>
                      <td className="py-2 pr-2">{g.slug}</td>
                      <td className="py-2 pr-2">{new Date(g.created_at).toLocaleDateString()}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => void onToggleActive(g)}
                          className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                            g.is_active
                              ? 'border-green-300 text-green-700 hover:bg-green-50'
                              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {g.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
