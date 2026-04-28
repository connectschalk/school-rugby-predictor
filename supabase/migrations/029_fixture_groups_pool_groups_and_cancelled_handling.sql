-- Fixture groups model for pools + cancelled match score cleanup.

alter table public.game_matches
  add column if not exists province_group text,
  add column if not exists league_group text,
  add column if not exists is_prestige boolean not null default false;

alter table public.game_matches
  drop constraint if exists game_matches_status_check;

alter table public.game_matches
  add constraint game_matches_status_check
  check (status in ('upcoming', 'locked', 'completed', 'cancelled'));

create table if not exists public.fixture_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.game_match_groups (
  match_id uuid not null references public.game_matches (id) on delete cascade,
  group_id uuid not null references public.fixture_groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, group_id)
);

create table if not exists public.pool_groups (
  pool_id uuid not null references public.pools (id) on delete cascade,
  group_id uuid not null references public.fixture_groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pool_id, group_id)
);

create index if not exists game_match_groups_group_idx on public.game_match_groups (group_id, match_id);
create index if not exists pool_groups_pool_idx on public.pool_groups (pool_id, group_id);

insert into public.fixture_groups (name, slug, is_active)
values
  ('Western Province', 'western-province', true),
  ('Noordvaal', 'noordvaal', true),
  ('KwaZulu-Natal', 'kwazulu-natal', true),
  ('Free State / Griquas', 'free-state-griquas', true),
  ('Eastern Cape', 'eastern-cape', true),
  ('Prestige Pool', 'prestige-pool', true)
on conflict (slug) do update
set name = excluded.name, is_active = excluded.is_active;

create or replace function public.slugify_group_name(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'));
$$;

alter table public.fixture_groups enable row level security;
alter table public.game_match_groups enable row level security;
alter table public.pool_groups enable row level security;

drop policy if exists fixture_groups_select_public on public.fixture_groups;
create policy fixture_groups_select_public
on public.fixture_groups for select
to anon, authenticated
using (true);

drop policy if exists game_match_groups_select_public on public.game_match_groups;
create policy game_match_groups_select_public
on public.game_match_groups for select
to anon, authenticated
using (true);

drop policy if exists pool_groups_member_select on public.pool_groups;
create policy pool_groups_member_select
on public.pool_groups for select
to authenticated
using (public.is_pool_member(pool_id, auth.uid()));

grant select on public.fixture_groups, public.game_match_groups, public.pool_groups to anon, authenticated;

create or replace function public.list_fixture_groups()
returns table (
  id uuid,
  name text,
  slug text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select fg.id, fg.name, fg.slug, fg.is_active
  from public.fixture_groups fg
  where fg.is_active = true
  order by fg.name asc;
$$;

create or replace function public.set_pool_groups(
  p_pool_id uuid,
  p_group_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.is_pool_admin(p_pool_id, v_uid) then
    raise exception 'admin only';
  end if;

  delete from public.pool_groups pg where pg.pool_id = p_pool_id;

  insert into public.pool_groups (pool_id, group_id)
  select p_pool_id, fg.id
  from public.fixture_groups fg
  where fg.id = any(coalesce(p_group_ids, array[]::uuid[]))
    and fg.is_active = true
  on conflict (pool_id, group_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.delete_pool(
  p_pool_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.is_pool_admin(p_pool_id, v_uid) then
    raise exception 'admin only';
  end if;

  update public.pools
  set is_closed = true
  where id = p_pool_id;
end;
$$;

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
  )
  select distinct gm.id as match_id
  from public.game_matches gm
  join public.game_match_groups gmg on gmg.match_id = gm.id
  where gmg.group_id in (select eg.group_id from effective_groups eg)
    and gm.status <> 'cancelled';
$$;

create or replace function public.sync_game_match_groups_from_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_group_id uuid;
begin
  delete from public.game_match_groups where match_id = new.id;

  if coalesce(new.is_prestige, false) = true then
    select id into v_group_id from public.fixture_groups where slug = 'prestige-pool' limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  if nullif(trim(coalesce(new.province_group, '')), '') is not null then
    v_slug := public.slugify_group_name(new.province_group);
    insert into public.fixture_groups (name, slug, is_active)
    values (trim(new.province_group), v_slug, false)
    on conflict (slug) do nothing;

    select id into v_group_id from public.fixture_groups where slug = v_slug limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  if nullif(trim(coalesce(new.league_group, '')), '') is not null then
    v_slug := public.slugify_group_name(new.league_group);
    insert into public.fixture_groups (name, slug, is_active)
    values (trim(new.league_group), v_slug, false)
    on conflict (slug) do nothing;

    select id into v_group_id from public.fixture_groups where slug = v_slug limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_game_match_groups_from_fields on public.game_matches;
create trigger trg_sync_game_match_groups_from_fields
after insert or update of province_group, league_group, is_prestige on public.game_matches
for each row
execute function public.sync_game_match_groups_from_fields();

-- Backfill links for existing fixtures.
insert into public.game_match_groups (match_id, group_id)
select gm.id, fg.id
from public.game_matches gm
join public.fixture_groups fg on fg.slug = 'prestige-pool'
where coalesce(gm.is_prestige, false) = true
on conflict do nothing;

insert into public.fixture_groups (name, slug, is_active)
select distinct trim(gm.province_group), public.slugify_group_name(gm.province_group), false
from public.game_matches gm
where nullif(trim(coalesce(gm.province_group, '')), '') is not null
on conflict (slug) do nothing;

insert into public.game_match_groups (match_id, group_id)
select gm.id, fg.id
from public.game_matches gm
join public.fixture_groups fg on fg.slug = public.slugify_group_name(gm.province_group)
where nullif(trim(coalesce(gm.province_group, '')), '') is not null
on conflict do nothing;

insert into public.fixture_groups (name, slug, is_active)
select distinct trim(gm.league_group), public.slugify_group_name(gm.league_group), false
from public.game_matches gm
where nullif(trim(coalesce(gm.league_group, '')), '') is not null
on conflict (slug) do nothing;

insert into public.game_match_groups (match_id, group_id)
select gm.id, fg.id
from public.game_matches gm
join public.fixture_groups fg on fg.slug = public.slugify_group_name(gm.league_group)
where nullif(trim(coalesce(gm.league_group, '')), '') is not null
on conflict do nothing;

create or replace function public.purge_scores_for_cancelled_matches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.user_prediction_scores ups
  using public.game_matches gm
  where ups.match_id = gm.id
    and gm.status = 'cancelled';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.handle_cancelled_match_score_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    delete from public.user_prediction_scores where match_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_game_matches_cancel_cleanup on public.game_matches;
create trigger trg_game_matches_cancel_cleanup
after update on public.game_matches
for each row
execute function public.handle_cancelled_match_score_cleanup();

revoke all on function public.list_fixture_groups() from public;
revoke all on function public.set_pool_groups(uuid, uuid[]) from public;
revoke all on function public.delete_pool(uuid) from public;
revoke all on function public.pool_effective_matches(uuid, date) from public;
revoke all on function public.purge_scores_for_cancelled_matches() from public;

grant execute on function public.list_fixture_groups() to anon, authenticated;
grant execute on function public.set_pool_groups(uuid, uuid[]) to authenticated;
grant execute on function public.delete_pool(uuid) to authenticated;
grant execute on function public.pool_effective_matches(uuid, date) to authenticated;
grant execute on function public.purge_scores_for_cancelled_matches() to authenticated, service_role;
