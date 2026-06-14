-- Phase 2: competition-aware pool creation and effective match scope.

drop function if exists public.create_pool(text, boolean);

create or replace function public.create_pool(
  p_name text,
  p_is_public boolean default false,
  p_competition_id uuid default null
)
returns public.pools
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pool public.pools;
  v_competition_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if p_competition_id is not null then
    select c.id into v_competition_id
    from public.competitions c
    where c.id = p_competition_id and c.is_active = true;
    if v_competition_id is null then
      raise exception 'invalid or inactive competition';
    end if;
  else
    select c.id into v_competition_id
    from public.competitions c
    where c.slug = 'nextplay-schools' and c.is_active = true
    limit 1;
  end if;

  insert into public.pools (name, admin_user_id, created_by, is_public, competition_id)
  values (trim(p_name), v_uid, v_uid, coalesce(p_is_public, false), v_competition_id)
  returning * into v_pool;

  insert into public.pool_members (pool_id, user_id)
  values (v_pool.id, v_uid)
  on conflict (pool_id, user_id) do nothing;

  return v_pool;
end;
$$;

revoke all on function public.create_pool(text, boolean, uuid) from public;
grant execute on function public.create_pool(text, boolean, uuid) to authenticated;

-- pool_effective_matches: official competitions use all competition fixtures;
-- custom competitions keep group/team scope, filtered by competition_id.

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
  with pool_ctx as (
    select
      coalesce(
        p.competition_id,
        (select c2.id from public.competitions c2 where c2.slug = 'nextplay-schools' limit 1)
      ) as effective_competition_id,
      coalesce(c.competition_mode, 'custom_pool_fixtures') as competition_mode
    from public.pools p
    left join public.competitions c on c.id = p.competition_id
    where p.id = p_pool_id
  ),
  official_matches as (
    select distinct gm.id as match_id
    from public.game_matches gm
    cross join pool_ctx pc
    where pc.competition_mode = 'official_fixed_fixtures'
      and pc.effective_competition_id is not null
      and gm.competition_id = pc.effective_competition_id
      and gm.status <> 'cancelled'
  ),
  selected_groups as (
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
  ),
  custom_raw as (
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
    where coalesce(hpt.v, false) and coalesce(heg.v, false)
  ),
  custom_matches as (
    select distinct cr.match_id
    from custom_raw cr
    cross join pool_ctx pc
    join public.game_matches gm on gm.id = cr.match_id
    where pc.competition_mode = 'custom_pool_fixtures'
      and (
        pc.effective_competition_id is null
        or gm.competition_id = pc.effective_competition_id
      )
  )
  select om.match_id from official_matches om
  union
  select cm.match_id from custom_matches cm;
$$;

revoke all on function public.pool_effective_matches(uuid, date) from public;
grant execute on function public.pool_effective_matches(uuid, date) to authenticated;
