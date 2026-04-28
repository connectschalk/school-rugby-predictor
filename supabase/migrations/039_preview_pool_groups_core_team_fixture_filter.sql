create or replace function public.normalize_team_name_for_preview(p_name text)
returns text
language sql
immutable
as $$
  with base as (
    select lower(trim(coalesce(p_name, ''))) as v
  )
  select case
    when v in ('paarl boys', 'paarl boys high') then 'paarl boys high'
    when v in ('paarl gim', 'paarl gimnasium') then 'paarl gimnasium'
    when v in ('affies', 'afrikaans hoer seuns') then 'afrikaans hoer seuns'
    else v
  end
  from base;
$$;

create or replace function public.preview_pool_groups(
  p_group_ids uuid[]
)
returns table (
  total_matches bigint,
  teams text[],
  fixtures jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_fixture_group_teams boolean := true;
begin
  begin
    perform 1 from public.fixture_group_teams limit 1;
  exception
    when undefined_table then
      v_has_fixture_group_teams := false;
  end;

  if v_has_fixture_group_teams then
    return query
    with selected_groups as (
      select unnest(coalesce(p_group_ids, array[]::uuid[])) as group_id
    ),
    core_group_teams as (
      select
        fgt.group_id,
        fgt.team_name as team,
        public.normalize_team_name_for_preview(fgt.team_name) as team_norm
      from public.fixture_group_teams fgt
      where fgt.group_id in (select group_id from selected_groups)
        and nullif(trim(fgt.team_name), '') is not null
    ),
    groups_with_core as (
      select distinct cgt.group_id
      from core_group_teams cgt
    ),
    matched_by_group as (
      select
        gmg.group_id,
        gm.id as match_id,
        gm.home_team,
        gm.away_team,
        gm.kickoff_time
      from public.game_matches gm
      join public.game_match_groups gmg on gmg.match_id = gm.id
      where gm.status <> 'cancelled'
        and gmg.group_id in (select group_id from selected_groups)
        and (
          gmg.group_id not in (select gwc.group_id from groups_with_core gwc)
          or exists (
            select 1
            from core_group_teams cgt
            where cgt.group_id = gmg.group_id
              and (
                cgt.team_norm = public.normalize_team_name_for_preview(gm.home_team)
                or cgt.team_norm = public.normalize_team_name_for_preview(gm.away_team)
              )
          )
        )
    ),
    matched as (
      select
        mbg.match_id,
        min(mbg.home_team) as home_team,
        min(mbg.away_team) as away_team,
        min(mbg.kickoff_time) as kickoff_time
      from matched_by_group mbg
      group by mbg.match_id
    ),
    match_groups as (
      select
        gmg.match_id,
        array_agg(distinct fg.name order by fg.name) as group_names
      from public.game_match_groups gmg
      join public.fixture_groups fg on fg.id = gmg.group_id
      where gmg.match_id in (select m.match_id from matched m)
        and gmg.group_id in (select group_id from selected_groups)
      group by gmg.match_id
    ),
    upcoming as (
      select
        m.match_id,
        m.home_team,
        m.away_team,
        m.kickoff_time,
        coalesce(mg.group_names, array[]::text[]) as group_names
      from matched m
      left join match_groups mg on mg.match_id = m.match_id
      where m.kickoff_time >= now()
      order by m.kickoff_time asc
      limit 10
    ),
    groups_without_core as (
      select sg.group_id
      from selected_groups sg
      where sg.group_id not in (select gwc.group_id from groups_with_core gwc)
    ),
    fallback_fixture_teams as (
      select
        mbg.group_id,
        mbg.home_team as team
      from matched_by_group mbg
      where mbg.group_id in (select group_id from groups_without_core)
      union all
      select
        mbg.group_id,
        mbg.away_team as team
      from matched_by_group mbg
      where mbg.group_id in (select group_id from groups_without_core)
    ),
    all_teams as (
      select array_agg(distinct t.team order by t.team) as teams
      from (
        select cgt.team from core_group_teams cgt
        union
        select fft.team from fallback_fixture_teams fft
      ) t
      where nullif(trim(t.team), '') is not null
    ),
    fixture_json as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'match_id', u.match_id,
            'home_team', u.home_team,
            'away_team', u.away_team,
            'kickoff_time', u.kickoff_time,
            'group_names', u.group_names
          )
          order by u.kickoff_time asc
        ),
        '[]'::jsonb
      ) as fixtures
      from upcoming u
    )
    select
      (select count(*) from matched)::bigint as total_matches,
      coalesce((select teams from all_teams), array[]::text[]) as teams,
      (select fixtures from fixture_json) as fixtures;
  else
    return query
    with selected_groups as (
      select unnest(coalesce(p_group_ids, array[]::uuid[])) as group_id
    ),
    matched as (
      select
        gm.id as match_id,
        gm.home_team,
        gm.away_team,
        gm.kickoff_time
      from public.game_matches gm
      join public.game_match_groups gmg on gmg.match_id = gm.id
      where gm.status <> 'cancelled'
        and gmg.group_id in (select group_id from selected_groups)
      group by gm.id, gm.home_team, gm.away_team, gm.kickoff_time
    ),
    match_groups as (
      select
        gmg.match_id,
        array_agg(distinct fg.name order by fg.name) as group_names
      from public.game_match_groups gmg
      join public.fixture_groups fg on fg.id = gmg.group_id
      where gmg.match_id in (select m.match_id from matched m)
        and gmg.group_id in (select group_id from selected_groups)
      group by gmg.match_id
    ),
    upcoming as (
      select
        m.match_id,
        m.home_team,
        m.away_team,
        m.kickoff_time,
        coalesce(mg.group_names, array[]::text[]) as group_names
      from matched m
      left join match_groups mg on mg.match_id = m.match_id
      where m.kickoff_time >= now()
      order by m.kickoff_time asc
      limit 10
    ),
    all_teams as (
      select array_agg(distinct t.team order by t.team) as teams
      from (
        select m.home_team as team from matched m
        union
        select m.away_team as team from matched m
      ) t
    ),
    fixture_json as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'match_id', u.match_id,
            'home_team', u.home_team,
            'away_team', u.away_team,
            'kickoff_time', u.kickoff_time,
            'group_names', u.group_names
          )
          order by u.kickoff_time asc
        ),
        '[]'::jsonb
      ) as fixtures
      from upcoming u
    )
    select
      (select count(*) from matched)::bigint as total_matches,
      coalesce((select teams from all_teams), array[]::text[]) as teams,
      (select fixtures from fixture_json) as fixtures;
  end if;
end;
$$;

revoke all on function public.normalize_team_name_for_preview(text) from public;
grant execute on function public.normalize_team_name_for_preview(text) to authenticated;

revoke all on function public.preview_pool_groups(uuid[]) from public;
grant execute on function public.preview_pool_groups(uuid[]) to authenticated;
