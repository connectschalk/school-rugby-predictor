'use client'

import { useMemo, useState } from 'react'
import CompetitionImportPanel from '@/components/admin/CompetitionImportPanel'
import SchoolsSheetSyncPanel from '@/components/admin/SchoolsSheetSyncPanel'
import {
  adminCompetitionFetch,
  formatKickoffDisplay,
  isoToDatetimeLocalInput,
} from '@/lib/admin-competition-api-client'
import { adminFixtureVenue, type AdminFixtureRow } from '@/lib/admin-competition-stats'
import CompetitionTeamLogo, { competitionUsesTeamLogos } from '@/components/admin/CompetitionTeamLogo'
import { CRAVEN_WEEK_TEAM_NAMES } from '@/lib/craven-week-team-logos'
import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
import { WORLD_CUP_TEAM_NAMES } from '@/lib/world-cup-team-logos'
import type { GameMatchStatus } from '@/lib/public-prediction-game'

type Props = {
  competitionSlug: string
  fixtures: AdminFixtureRow[]
  onRefresh: () => void | Promise<void>
}

type FixtureForm = {
  home_team: string
  away_team: string
  kickoff: string
  venue: string
  fixture_round: string
  league_group: string
  status: GameMatchStatus
  external_id: string
}

const STATUS_OPTIONS: GameMatchStatus[] = ['upcoming', 'locked', 'completed', 'cancelled']

function emptyForm(): FixtureForm {
  return {
    home_team: '',
    away_team: '',
    kickoff: '',
    venue: '',
    fixture_round: '',
    league_group: '',
    status: 'upcoming',
    external_id: '',
  }
}

function formFromFixture(f: AdminFixtureRow): FixtureForm {
  return {
    home_team: f.home_team,
    away_team: f.away_team,
    kickoff: isoToDatetimeLocalInput(f.kickoff_time),
    venue: adminFixtureVenue(f),
    fixture_round: f.fixture_round ?? '',
    league_group: f.league_group ?? '',
    status: (f.status as GameMatchStatus) ?? 'upcoming',
    external_id: f.external_id ?? '',
  }
}

export default function CompetitionFixturesPanel({ competitionSlug, fixtures, onRefresh }: Props) {
  const isSchools = competitionSlug === SCHOOLS_COMPETITION_SLUG
  const showTeamLogos = competitionUsesTeamLogos(competitionSlug)
  const teamPickerNames =
    competitionSlug === 'soccer-world-cup'
      ? WORLD_CUP_TEAM_NAMES
      : competitionSlug === 'craven-week'
        ? CRAVEN_WEEK_TEAM_NAMES
        : null
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FixtureForm>(emptyForm())

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return fixtures
    return fixtures.filter(
      (f) =>
        f.home_team.toLowerCase().includes(q) ||
        f.away_team.toLowerCase().includes(q) ||
        (f.external_id ?? '').toLowerCase().includes(q)
    )
  }, [fixtures, search])

  function openAdd() {
    setForm(emptyForm())
    setEditingId(null)
    setModal('add')
    setMessage('')
  }

  function openEdit(f: AdminFixtureRow) {
    setForm(formFromFixture(f))
    setEditingId(f.id)
    setModal('edit')
    setMessage('')
  }

  function closeModal() {
    setModal(null)
    setEditingId(null)
  }

  async function saveFixture() {
    setBusy('save')
    setMessage('')
    try {
      const payload = {
        home_team: form.home_team,
        away_team: form.away_team,
        kickoff: form.kickoff,
        venue: form.venue,
        fixture_round: form.fixture_round,
        league_group: form.league_group,
        status: form.status,
        external_id: form.external_id,
      }
      const path =
        modal === 'add'
          ? `/api/admin/competitions/${competitionSlug}/fixtures`
          : `/api/admin/competitions/${competitionSlug}/fixtures/${editingId}`
      const res = await adminCompetitionFetch(path, {
        method: modal === 'add' ? 'POST' : 'PATCH',
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? 'Could not save fixture')
        return
      }
      closeModal()
      setMessage(modal === 'add' ? 'Fixture added.' : 'Fixture updated.')
      await onRefresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save fixture')
    } finally {
      setBusy(null)
    }
  }

  async function cancelFixture(f: AdminFixtureRow) {
    if (!window.confirm(`Cancel fixture ${f.home_team} vs ${f.away_team}?`)) return
    setBusy(`cancel-${f.id}`)
    setMessage('')
    try {
      const res = await adminCompetitionFetch(
        `/api/admin/competitions/${competitionSlug}/fixtures/${f.id}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }
      )
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? 'Could not cancel fixture')
        return
      }
      setMessage('Fixture cancelled.')
      await onRefresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not cancel fixture')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      {isSchools ? <SchoolsSheetSyncPanel /> : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">Fixtures</h3>
            <p className="mt-1 text-sm text-gray-600">
              {fixtures.length} fixture{fixtures.length === 1 ? '' : 's'} in this competition
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            Add Fixture
          </button>
        </div>

        <input
          type="search"
          placeholder="Search team or external id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />

        {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}

        {filtered.length === 0 ? (
          <p className="mt-4 text-sm text-gray-600">No fixtures yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="py-2 pr-3">Kickoff</th>
                  <th className="py-2 pr-3">Home</th>
                  <th className="py-2 pr-3">Away</th>
                  <th className="py-2 pr-3">Round</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatKickoffDisplay(f.kickoff_time)}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        {showTeamLogos ? (
                          <CompetitionTeamLogo
                            competitionSlug={competitionSlug}
                            teamName={f.home_team}
                            size={22}
                          />
                        ) : null}
                        {f.home_team}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        {showTeamLogos ? (
                          <CompetitionTeamLogo
                            competitionSlug={competitionSlug}
                            teamName={f.away_team}
                            size={22}
                          />
                        ) : null}
                        {f.away_team}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{f.fixture_round ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          f.status === 'cancelled'
                            ? 'bg-gray-200 text-gray-700'
                            : f.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-50 text-amber-900'
                        }`}
                      >
                        {f.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(f)}
                          className="font-semibold text-red-700 underline"
                        >
                          Edit
                        </button>
                        {f.status !== 'cancelled' ? (
                          <button
                            type="button"
                            disabled={busy === `cancel-${f.id}`}
                            onClick={() => void cancelFixture(f)}
                            className="font-semibold text-gray-600 underline disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CompetitionImportPanel competitionSlug={competitionSlug} kind="fixtures" onSuccess={onRefresh} />

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              {modal === 'add' ? 'Add fixture' : 'Edit fixture'}
            </h3>
            <div className="mt-4 grid gap-3">
              <label className="text-xs font-semibold text-gray-600">
                Home team
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.home_team}
                  onChange={(e) => setForm((s) => ({ ...s, home_team: e.target.value }))}
                  list={teamPickerNames ? 'competition-teams' : undefined}
                />
                {showTeamLogos && form.home_team ? (
                  <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-500">
                    <CompetitionTeamLogo
                      competitionSlug={competitionSlug}
                      teamName={form.home_team}
                      size={20}
                    />
                    Preview
                  </span>
                ) : null}
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Away team
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.away_team}
                  onChange={(e) => setForm((s) => ({ ...s, away_team: e.target.value }))}
                  list={teamPickerNames ? 'competition-teams' : undefined}
                />
                {showTeamLogos && form.away_team ? (
                  <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-500">
                    <CompetitionTeamLogo
                      competitionSlug={competitionSlug}
                      teamName={form.away_team}
                      size={20}
                    />
                    Preview
                  </span>
                ) : null}
              </label>
              {teamPickerNames ? (
                <datalist id="competition-teams">
                  {teamPickerNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              ) : null}
              <label className="text-xs font-semibold text-gray-600">
                Kickoff
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.kickoff}
                  onChange={(e) => setForm((s) => ({ ...s, kickoff: e.target.value }))}
                />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Venue
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.venue}
                  onChange={(e) => setForm((s) => ({ ...s, venue: e.target.value }))}
                />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Round
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.fixture_round}
                  onChange={(e) => setForm((s) => ({ ...s, fixture_round: e.target.value }))}
                />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Group
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.league_group}
                  onChange={(e) => setForm((s) => ({ ...s, league_group: e.target.value }))}
                />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Status
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as GameMatchStatus }))}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-gray-600">
                External ID
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                  value={form.external_id}
                  onChange={(e) => setForm((s) => ({ ...s, external_id: e.target.value }))}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                disabled={busy === 'save'}
                onClick={() => void saveFixture()}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
