create or replace function public.preview_pool_groups(
  p_group_ids uuid[]
)
returns table (
  total_matches bigint,
  teams text[],
  fixtures jsonb
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.preview_pool_groups(uuid[]) from public;
grant execute on function public.preview_pool_groups(uuid[]) to authenticated;
