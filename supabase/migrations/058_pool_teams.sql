-- Pool-scoped team selection: optional list of canonical team names.
-- When a pool has any pool_teams rows, effective fixtures are all non-cancelled
-- game_matches where home_team or away_team matches a listed team (exact trim match).
-- When pool_teams is empty, behaviour matches previous pool_effective_matches (groups + province follow).

create table if not exists public.pool_teams (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  team_name text not null,
  created_at timestamptz not null default now(),
  unique (pool_id, team_name)
);

create index if not exists pool_teams_pool_id_idx on public.pool_teams (pool_id);

alter table public.pool_teams enable row level security;

drop policy if exists pool_teams_select on public.pool_teams;
create policy pool_teams_select
on public.pool_teams for select
to authenticated
using (public.is_pool_member(pool_id, auth.uid()));

drop policy if exists pool_teams_insert on public.pool_teams;
create policy pool_teams_insert
on public.pool_teams for insert
to authenticated
with check (public.is_pool_admin(pool_id, auth.uid()));

drop policy if exists pool_teams_delete on public.pool_teams;
create policy pool_teams_delete
on public.pool_teams for delete
to authenticated
using (public.is_pool_admin(pool_id, auth.uid()));

revoke all on public.pool_teams from public;
grant select, insert, delete on public.pool_teams to authenticated;

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
      select 1 from public.pool_teams pt where pt.pool_id = p_pool_id limit 1
    ) as v
  )
  select fg.match_id
  from from_groups fg
  cross join has_pool_teams h
  where not coalesce(h.v, false)
  union
  select bt.match_id
  from by_teams bt
  cross join has_pool_teams h
  where coalesce(h.v, false);
$$;

revoke all on function public.pool_effective_matches(uuid, date) from public;
grant execute on function public.pool_effective_matches(uuid, date) to authenticated;
