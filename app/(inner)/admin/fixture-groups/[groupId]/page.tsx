'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchUserIsAdmin } from '@/lib/admin-access'

type GroupType = 'province' | 'league' | 'festival' | 'prestige' | 'custom'

type GroupRow = {
  id: string
  name: string
  slug: string
  group_type: GroupType
  is_active: boolean
  visible_in_pools: boolean
}

type GroupFixtureRow = {
  match_id: string
  kickoff_time: string
  home_team: string
  away_team: string
  status: string
}

export default function AdminFixtureGroupDetailPage() {
  const params = useParams<{ groupId: string }>()
  const router = useRouter()
  const groupId = useMemo(() => String(params?.groupId ?? ''), [params])

  const [authChecked, setAuthChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [group, setGroup] = useState<GroupRow | null>(null)
  const [teams, setTeams] = useState<string[]>([])
  const [teamInput, setTeamInput] = useState('')
  const [bulkTeamsInput, setBulkTeamsInput] = useState('')
  const [fixtures, setFixtures] = useState<GroupFixtureRow[]>([])

  const loadData = useCallback(async () => {
    if (!groupId) return
    setLoading(true)

    const [groupRes, teamsRes, fixturesRes] = await Promise.all([
      supabase
        .from('fixture_groups')
        .select('id, name, slug, group_type, is_active, visible_in_pools')
        .eq('id', groupId)
        .maybeSingle(),
      supabase.from('fixture_group_teams').select('team_name').eq('group_id', groupId).order('team_name'),
      supabase
        .from('game_match_groups')
        .select('match_id, game_matches(kickoff_time, home_team, away_team, status)')
        .eq('group_id', groupId),
    ])

    if (groupRes.error) {
      setMessage(`Could not load group: ${groupRes.error.message}`)
      setGroup(null)
      setLoading(false)
      return
    }
    if (!groupRes.data) {
      setMessage('Group not found.')
      setGroup(null)
      setLoading(false)
      return
    }

    setGroup(groupRes.data as GroupRow)
    setTeams(
      (((teamsRes.data as { team_name: string | null }[] | null) ?? [])
        .map((r) => (r.team_name ?? '').trim())
        .filter(Boolean) as string[])
    )

    const fixtureRows: GroupFixtureRow[] = (((fixturesRes.data as {
      match_id: string
      game_matches:
        | { kickoff_time: string | null; home_team: string | null; away_team: string | null; status: string | null }
        | {
            kickoff_time: string | null
            home_team: string | null
            away_team: string | null
            status: string | null
          }[]
        | null
    }[] | null) ?? [])
      .map((row) => {
        const gm = Array.isArray(row.game_matches) ? row.game_matches[0] : row.game_matches
        if (!gm) return null
        return {
          match_id: row.match_id,
          kickoff_time: String(gm.kickoff_time ?? ''),
          home_team: String(gm.home_team ?? ''),
          away_team: String(gm.away_team ?? ''),
          status: String(gm.status ?? ''),
        } as GroupFixtureRow
      })
      .filter((r): r is GroupFixtureRow => Boolean(r))
      .sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime())
      .slice(0, 20))
    setFixtures(fixtureRows)
    setLoading(false)
  }, [groupId])

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
      await loadData()
    }
    void checkAccess()
  }, [loadData, router])

  async function onToggleActive() {
    if (!group) return
    setSaving(true)
    setMessage('')
    const { error } = await supabase.rpc('admin_update_fixture_group', {
      p_group_id: group.id,
      p_is_active: !group.is_active,
    })
    if (error) {
      setMessage(`Could not update active state: ${error.message}`)
    } else {
      await loadData()
    }
    setSaving(false)
  }

  async function onToggleVisible() {
    if (!group) return
    setSaving(true)
    setMessage('')
    const { error } = await supabase.rpc('admin_update_fixture_group_visibility', {
      p_group_id: group.id,
      p_visible_in_pools: !group.visible_in_pools,
    })
    if (error) {
      setMessage(`Could not update pool visibility: ${error.message}`)
    } else {
      await loadData()
    }
    setSaving(false)
  }

  async function addTeam(teamName: string) {
    if (!group) return
    const trimmed = teamName.trim()
    if (!trimmed) return
    setSaving(true)
    setMessage('')
    const { error } = await supabase.rpc('admin_add_group_team', {
      p_group_id: group.id,
      p_team_name: trimmed,
    })
    if (error) {
      setMessage(`Could not add team: ${error.message}`)
    } else {
      await loadData()
    }
    setSaving(false)
  }

  async function onAddSingleTeam(e: React.FormEvent) {
    e.preventDefault()
    await addTeam(teamInput)
    setTeamInput('')
  }

  async function onBulkAddTeams() {
    const lines = bulkTeamsInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) return

    const deduped = [...new Set(lines.map((line) => line.toLowerCase()))]
    const originalByLower = new Map<string, string>()
    for (const line of lines) {
      const lower = line.toLowerCase()
      if (!originalByLower.has(lower)) originalByLower.set(lower, line)
    }

    setSaving(true)
    setMessage('')
    for (const lower of deduped) {
      const name = originalByLower.get(lower) ?? lower
      const { error } = await supabase.rpc('admin_add_group_team', {
        p_group_id: groupId,
        p_team_name: name,
      })
      if (error) {
        setMessage(`Some teams could not be added: ${error.message}`)
        break
      }
    }
    setBulkTeamsInput('')
    await loadData()
    setSaving(false)
  }

  async function onRemoveTeam(teamName: string) {
    if (!group) return
    setSaving(true)
    setMessage('')
    const { error } = await supabase.rpc('admin_remove_group_team', {
      p_group_id: group.id,
      p_team_name: teamName,
    })
    if (error) {
      setMessage(`Could not remove team: ${error.message}`)
    } else {
      await loadData()
    }
    setSaving(false)
  }

  if (!authChecked || loading) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <p>Loading...</p>
        </div>
      </main>
    )
  }

  if (!group) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <p className="text-sm text-gray-700">{message || 'Group not found.'}</p>
          <Link href="/admin/fixture-groups" className="mt-3 inline-block text-sm underline text-gray-700 hover:text-black">
            Back to fixture groups
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{group.name}</h1>
            <p className="mt-1 text-sm text-gray-600">Manage core teams and verify fixture links for this group.</p>
          </div>
          <Link href="/admin/fixture-groups" className="text-sm text-gray-700 underline hover:text-black">
            Back to fixture groups
          </Link>
        </div>
        {message ? <p className="mt-4 text-sm text-gray-700">{message}</p> : null}

        <section className="mt-6 rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold">Group info</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p className="text-sm"><span className="font-semibold">Name:</span> {group.name}</p>
            <p className="text-sm"><span className="font-semibold">Type:</span> {group.group_type}</p>
            <p className="text-sm"><span className="font-semibold">Slug:</span> {group.slug}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void onToggleActive()}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                group.is_active ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {group.is_active ? 'Active' : 'Inactive'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void onToggleVisible()}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                group.visible_in_pools ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {group.visible_in_pools ? 'Visible in pool selection' : 'Hidden from pool selection'}
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold">Core teams management</h2>
          <form onSubmit={onAddSingleTeam} className="mt-3 flex gap-2">
            <input
              value={teamInput}
              onChange={(e) => setTeamInput(e.target.value)}
              placeholder="Add team name"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={saving || !teamInput.trim()}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Add team
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {teams.length === 0 ? (
              <p className="text-sm text-gray-600">No core teams set yet.</p>
            ) : (
              teams.map((team) => (
                <div key={team} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                  <p className="text-sm text-gray-800">{team}</p>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onRemoveTeam(team)}
                    className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold">Bulk add teams</h2>
          <textarea
            value={bulkTeamsInput}
            onChange={(e) => setBulkTeamsInput(e.target.value)}
            rows={6}
            placeholder={'Paarl Boys\nPaul Roos\nStellenberg'}
            className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void onBulkAddTeams()}
            disabled={saving || bulkTeamsInput.trim().length === 0}
            className="mt-3 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add teams
          </button>
        </section>

        <section className="mt-6 rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold">Fixtures using this group</h2>
          {fixtures.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">No linked fixtures yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {fixtures.map((f) => (
                <div key={f.match_id} className="rounded-xl border border-gray-200 px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900">
                    {new Date(f.kickoff_time).toLocaleString()} - {f.home_team} vs {f.away_team}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">Status: {f.status}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
