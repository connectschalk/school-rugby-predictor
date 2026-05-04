-- pool_effective_matches: when pool has explicit pool_groups AND pool_teams with
-- non-empty names, return the union of group-scoped and team-scoped fixtures.
-- When only pool_teams (no rows in pool_groups), keep team-only scope (no prestige union).
-- When no pool_teams, keep group scope (including prestige fallback when no groups).

create or replace function public.pool_effective_matches(
  p_pool_id uuid,
  p_week_start date default null
)
returns table (
  match_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with selected_groups as (
    select pg.group_id
    from public.pool_groups pg
    where pg.pool_id = p_pool_id
  ),
  fallback_group as (
    select fg.id as group_id
    from public.fixture_groups fg
    where fg.slug = 'prestige-pool'
    limit 1
  ),
  effective_groups as (
    select sg.group_id from selected_groups sg
    union all
    select fg.group_id
    from fallback_group fg
    where not exists (select 1 from selected_groups)
  ),
  by_links as (
    select distinct gm.id as match_id
    from public.game_matches gm
    join public.game_match_groups gmg on gmg.match_id = gm.id
    where gmg.group_id in (select eg.group_id from effective_groups eg)
      and gm.status <> 'cancelled'
  ),
  by_province_follow as (
    select distinct gm.id as match_id
    from public.game_matches gm
    join selected_groups sg on true
    join public.fixture_groups fg on fg.id = sg.group_id
    where gm.status <> 'cancelled'
      and public.pool_match_follows_province_group(
        gm.home_team_province,
        gm.away_team_province,
        gm.province_group,
        fg.id
      )
  ),
  from_groups as (
    select by_links.match_id from by_links
    union
    select by_province_follow.match_id from by_province_follow
  ),
  by_teams as (
    select distinct gm.id as match_id
    from public.game_matches gm
    where gm.status <> 'cancelled'
      and exists (
        select 1
        from public.pool_teams pt
        where pt.pool_id = p_pool_id
          and nullif(trim(pt.team_name), '') is not null
          and (
            trim(gm.home_team) = trim(pt.team_name)
            or trim(gm.away_team) = trim(pt.team_name)
          )
      )
  ),
  has_pool_teams as (
    select exists (
      select 1
      from public.pool_teams pt
      where pt.pool_id = p_pool_id
        and nullif(trim(pt.team_name), '') is not null
      limit 1
    ) as v
  ),
  has_explicit_groups as (
    select exists (
      select 1 from public.pool_groups pg where pg.pool_id = p_pool_id limit 1
    ) as v
  )
  select fg.match_id
  from from_groups fg
  cross join has_pool_teams hpt
  cross join has_explicit_groups heg
  where not coalesce(hpt.v, false)
  union
  select bt.match_id
  from by_teams bt
  cross join has_pool_teams hpt
  cross join has_explicit_groups heg
  where coalesce(hpt.v, false) and not coalesce(heg.v, false)
  union
  select u.match_id
  from (
    select fg2.match_id from from_groups fg2
    union
    select bt2.match_id from by_teams bt2
  ) u
  cross join has_pool_teams hpt
  cross join has_explicit_groups heg
  where coalesce(hpt.v, false) and coalesce(heg.v, false);
$$;

revoke all on function public.pool_effective_matches(uuid, date) from public;
grant execute on function public.pool_effective_matches(uuid, date) to authenticated;
