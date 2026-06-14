'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ProvinceLogoMark from '@/components/ProvinceLogoMark'
import { groupByDateOnly, groupByProvinceThenDate } from '@/lib/predict-score-common'
import { fetchCompetitionFixtures, type GameMatch } from '@/lib/public-prediction-game'
import {
  matchBelongsToProvinceLogoCode,
  PROVINCE_LOGO_CODES_UI_ORDER,
  PROVINCE_LOGO_TITLES,
  PROVINCE_PREDICT_FILTER_LABEL,
  getProvinceLogoPath,
  type ProvinceLogoCode,
} from '@/lib/province-logos'
import { supabase } from '@/lib/supabase'

import CompetitionTeamLogo, { competitionUsesTeamLogos } from '@/components/admin/CompetitionTeamLogo'

export type CompetitionFixturesPanelProps = {
  competitionId: string
  competitionSlug?: string
  competitionName?: string
  showProvinceFilters?: boolean
}

import { formatKickoffJohannesburg } from '@/lib/admin-kickoff-johannesburg'

function statusLabel(status: GameMatch['status']) {
  if (status === 'completed') return 'Final'
  if (status === 'locked') return 'Locked'
  return 'Upcoming'
}

function FixtureRow({
  match,
  competitionSlug,
}: {
  match: GameMatch
  competitionSlug?: string
}) {
  const showTeamLogos = competitionSlug ? competitionUsesTeamLogos(competitionSlug) : false
  const score =
    match.status === 'completed' && match.home_score != null && match.away_score != null
      ? `${match.home_score} – ${match.away_score}`
      : null

  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_5rem_4rem] md:items-center md:gap-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <span>{statusLabel(match.status)}</span>
        <div className="mt-0.5 font-medium normal-case text-slate-700">
          {formatKickoffJohannesburg(match.kickoff_time)}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900">
        {showTeamLogos && competitionSlug ? (
          <CompetitionTeamLogo competitionSlug={competitionSlug} teamName={match.home_team} size={22} />
        ) : null}
        <span className="min-w-0 truncate">{match.home_team}</span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900">
        {showTeamLogos && competitionSlug ? (
          <CompetitionTeamLogo competitionSlug={competitionSlug} teamName={match.away_team} size={22} />
        ) : null}
        <span className="min-w-0 truncate">{match.away_team}</span>
      </div>
      <div className="text-xs font-semibold text-slate-600 md:text-center">{score ?? '—'}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 md:text-right">
        {match.status}
      </div>
    </div>
  )
}

export default function CompetitionFixturesPanel({
  competitionId,
  competitionSlug,
  competitionName,
  showProvinceFilters = true,
}: CompetitionFixturesPanelProps) {
  const [matches, setMatches] = useState<GameMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<ProvinceLogoCode | null>(null)

  const loadMatches = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const { data, error } = await fetchCompetitionFixtures(supabase, competitionId)
    if (error) {
      setLoadError(error.message)
      setMatches([])
    } else {
      setMatches(data)
    }
    setLoading(false)
  }, [competitionId])

  useEffect(() => {
    void loadMatches()
  }, [loadMatches])

  const filteredMatches = useMemo(() => {
    let list = matches
    const q = teamSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (m) => m.home_team.toLowerCase().includes(q) || m.away_team.toLowerCase().includes(q)
      )
    }
    if (selectedProvinceCode) {
      list = list.filter((m) =>
        matchBelongsToProvinceLogoCode(m.home_team_province, m.away_team_province, selectedProvinceCode)
      )
    }
    return list
  }, [matches, teamSearch, selectedProvinceCode])

  const groupedByProvince = useMemo(() => groupByProvinceThenDate(filteredMatches), [filteredMatches])
  const provinceFilterDayGroups = useMemo(
    () => (selectedProvinceCode ? groupByDateOnly(filteredMatches) : null),
    [selectedProvinceCode, filteredMatches]
  )

  return (
    <main className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden bg-gradient-to-b from-slate-50 via-white to-slate-100 pb-20 pt-8">
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6 px-4 sm:px-6">
        <header className="text-center">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Fixtures{competitionName ? ` · ${competitionName}` : ''}
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            All competition fixtures · read-only schedule
          </p>
        </header>

        <div className="w-full max-w-full min-w-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm">
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">
            Search team
          </label>
          <input
            type="search"
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
            placeholder="Search team…"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          {showProvinceFilters ? (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Province</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {PROVINCE_LOGO_CODES_UI_ORDER.map((code) => {
                  const active = selectedProvinceCode === code
                  return (
                    <button
                      key={code}
                      type="button"
                      title={PROVINCE_LOGO_TITLES[code]}
                      aria-pressed={active}
                      onClick={() => setSelectedProvinceCode((prev) => (prev === code ? null : code))}
                      className={`box-border flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-white p-0 transition ${
                        active
                          ? 'border-slate-900 bg-slate-100 shadow-inner ring-2 ring-slate-900/20'
                          : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- small static public assets */}
                      <img
                        src={getProvinceLogoPath(code)}
                        alt=""
                        className="h-9 w-9 object-contain object-center"
                        draggable={false}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        {loadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {loadError}
          </p>
        ) : null}

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading fixtures…</p>
        ) : matches.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-600">
            Fixtures for this competition have not been loaded yet.
          </p>
        ) : filteredMatches.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-600">
            No fixtures match your search or province filter.
          </p>
        ) : selectedProvinceCode && provinceFilterDayGroups ? (
          <section className="w-full min-w-0 max-w-full space-y-4">
            <h2 className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5 border-b border-slate-200 pb-2 text-lg font-black text-slate-900">
              <ProvinceLogoMark
                label={PROVINCE_PREDICT_FILTER_LABEL[selectedProvinceCode]}
                labelOnly
                size={32}
                className="shrink-0 shadow-sm"
              />
              <span className="min-w-0 break-words leading-tight">
                {PROVINCE_PREDICT_FILTER_LABEL[selectedProvinceCode]} fixtures: {filteredMatches.length}
              </span>
            </h2>
            {provinceFilterDayGroups.map((day) => (
              <div key={day.dateKey} className="min-w-0 max-w-full space-y-3">
                <h3 className="min-w-0 break-words text-sm font-semibold text-slate-500">{day.label}</h3>
                <div className="space-y-2">
                  {day.matches.map((m) => (
                    <FixtureRow key={m.id} match={m} competitionSlug={competitionSlug} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : (
          groupedByProvince.map((block) => (
            <section key={block.province} className="w-full min-w-0 max-w-full space-y-4">
              <h2 className="flex min-w-0 max-w-full items-center gap-2.5 border-b border-slate-200 pb-2 text-lg font-black text-slate-900">
                <ProvinceLogoMark label={block.province} labelOnly size={32} className="shrink-0 shadow-sm" />
                <span className="min-w-0 break-words leading-tight">{block.province}</span>
              </h2>
              {block.dates.map((day) => (
                <div key={day.dateKey} className="min-w-0 max-w-full space-y-3">
                  <h3 className="min-w-0 break-words text-sm font-semibold text-slate-500">{day.label}</h3>
                  <div className="space-y-2">
                    {day.matches.map((m) => (
                      <FixtureRow key={m.id} match={m} competitionSlug={competitionSlug} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </main>
  )
}
