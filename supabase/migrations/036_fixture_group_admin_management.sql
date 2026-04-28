alter table public.fixture_groups
  add column if not exists visible_in_pools boolean not null default true;

-- Defensive: some environments may not have migration 032 applied yet.
create or replace function public.is_app_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.user_profiles up
    where up.id = p_user_id
      and up.role = 'admin'
  );
$$;

create table if not exists public.fixture_group_teams (
  group_id uuid not null references public.fixture_groups (id) on delete cascade,
  team_name text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, team_name)
);

create unique index if not exists fixture_group_teams_group_lower_team_idx
on public.fixture_group_teams (group_id, lower(team_name));

alter table public.fixture_group_teams enable row level security;

drop policy if exists fixture_group_teams_select_public on public.fixture_group_teams;
create policy fixture_group_teams_select_public
on public.fixture_group_teams for select
using (true);

drop policy if exists fixture_group_teams_insert_admin on public.fixture_group_teams;
create policy fixture_group_teams_insert_admin
on public.fixture_group_teams for insert
with check (public.is_app_admin(auth.uid()));

drop policy if exists fixture_group_teams_update_admin on public.fixture_group_teams;
create policy fixture_group_teams_update_admin
on public.fixture_group_teams for update
using (public.is_app_admin(auth.uid()))
with check (public.is_app_admin(auth.uid()));

drop policy if exists fixture_group_teams_delete_admin on public.fixture_group_teams;
create policy fixture_group_teams_delete_admin
on public.fixture_group_teams for delete
using (public.is_app_admin(auth.uid()));

create or replace function public.admin_update_fixture_group_visibility(
  p_group_id uuid,
  p_visible_in_pools boolean
)
returns public.fixture_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fixture_groups%rowtype;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'Only admins can update fixture group visibility.';
  end if;

  update public.fixture_groups
  set visible_in_pools = p_visible_in_pools
  where id = p_group_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Fixture group not found.';
  end if;

  return v_row;
end;
$$;

create or replace function public.admin_add_group_team(
  p_group_id uuid,
  p_team_name text
)
returns table (
  group_id uuid,
  team_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_name text;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'Only admins can manage group teams.';
  end if;

  v_team_name := trim(coalesce(p_team_name, ''));
  if v_team_name = '' then
    raise exception 'Team name is required.';
  end if;

  if not exists (select 1 from public.fixture_groups where id = p_group_id) then
    raise exception 'Fixture group not found.';
  end if;

  insert into public.fixture_group_teams (group_id, team_name)
  values (p_group_id, v_team_name)
  on conflict (group_id, team_name) do update
  set team_name = excluded.team_name;

  return query
  select fgt.group_id, fgt.team_name
  from public.fixture_group_teams fgt
  where fgt.group_id = p_group_id
    and lower(fgt.team_name) = lower(v_team_name)
  limit 1;
end;
$$;

create or replace function public.admin_remove_group_team(
  p_group_id uuid,
  p_team_name text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint := 0;
  v_team_name text;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'Only admins can manage group teams.';
  end if;

  v_team_name := trim(coalesce(p_team_name, ''));
  if v_team_name = '' then
    raise exception 'Team name is required.';
  end if;

  delete from public.fixture_group_teams
  where group_id = p_group_id
    and lower(team_name) = lower(v_team_name);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.admin_update_fixture_group_visibility(uuid, boolean) from public;
revoke all on function public.admin_add_group_team(uuid, text) from public;
revoke all on function public.admin_remove_group_team(uuid, text) from public;

grant execute on function public.admin_update_fixture_group_visibility(uuid, boolean) to authenticated;
grant execute on function public.admin_add_group_team(uuid, text) to authenticated;
grant execute on function public.admin_remove_group_team(uuid, text) to authenticated;

grant select on public.fixture_group_teams to anon, authenticated;
