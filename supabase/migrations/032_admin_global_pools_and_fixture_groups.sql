-- Admin-only global pool management and fixture-group management helpers.

alter table public.fixture_groups
  add column if not exists group_type text not null default 'custom';

alter table public.fixture_groups
  drop constraint if exists fixture_groups_group_type_check;

alter table public.fixture_groups
  add constraint fixture_groups_group_type_check
  check (group_type in ('province', 'league', 'festival', 'prestige', 'custom'));

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

create or replace function public.admin_search_pools(
  p_search text default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  name text,
  admin_user_id uuid,
  admin_display_name text,
  member_count bigint,
  selected_groups text[],
  created_at timestamptz,
  is_closed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.id, p.name, p.admin_user_id, p.created_at, p.is_closed
    from public.pools p
    where (
      p_search is null
      or trim(p_search) = ''
      or p.name ilike '%' || trim(p_search) || '%'
    )
  )
  select
    b.id,
    b.name,
    b.admin_user_id,
    up.display_name as admin_display_name,
    count(distinct pm.user_id)::bigint as member_count,
    coalesce(array_agg(distinct fg.name) filter (where fg.name is not null), array[]::text[]) as selected_groups,
    b.created_at,
    b.is_closed
  from base b
  left join public.user_profiles up on up.id = b.admin_user_id
  left join public.pool_members pm on pm.pool_id = b.id
  left join public.pool_groups pg on pg.pool_id = b.id
  left join public.fixture_groups fg on fg.id = pg.group_id
  group by
    b.id,
    b.name,
    b.admin_user_id,
    up.display_name,
    b.created_at,
    b.is_closed
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.admin_close_pool(
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

  if not public.is_app_admin(v_uid) then
    raise exception 'admin only';
  end if;

  update public.pools
  set is_closed = true
  where id = p_pool_id;
end;
$$;

create or replace function public.admin_create_fixture_group(
  p_name text,
  p_group_type text
)
returns table (
  id uuid,
  name text,
  slug text,
  group_type text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_group_type text := lower(trim(coalesce(p_group_type, 'custom')));
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.is_app_admin(v_uid) then
    raise exception 'admin only';
  end if;

  if v_name = '' then
    raise exception 'name is required';
  end if;

  if v_group_type not in ('province', 'league', 'festival', 'prestige', 'custom') then
    raise exception 'invalid group_type';
  end if;

  return query
  insert into public.fixture_groups (name, slug, group_type, is_active)
  values (v_name, public.slugify_group_name(v_name), v_group_type, true)
  on conflict (slug) do update
  set name = excluded.name,
      group_type = excluded.group_type
  returning fixture_groups.id, fixture_groups.name, fixture_groups.slug, fixture_groups.group_type, fixture_groups.is_active, fixture_groups.created_at;
end;
$$;

create or replace function public.admin_update_fixture_group(
  p_group_id uuid,
  p_is_active boolean
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

  if not public.is_app_admin(v_uid) then
    raise exception 'admin only';
  end if;

  update public.fixture_groups
  set is_active = coalesce(p_is_active, true)
  where id = p_group_id;
end;
$$;

revoke all on function public.is_app_admin(uuid) from public;
revoke all on function public.admin_search_pools(text, integer) from public;
revoke all on function public.admin_close_pool(uuid) from public;
revoke all on function public.admin_create_fixture_group(text, text) from public;
revoke all on function public.admin_update_fixture_group(uuid, boolean) from public;

grant execute on function public.is_app_admin(uuid) to authenticated;
grant execute on function public.admin_search_pools(text, integer) to authenticated;
grant execute on function public.admin_close_pool(uuid) to authenticated;
grant execute on function public.admin_create_fixture_group(text, text) to authenticated;
grant execute on function public.admin_update_fixture_group(uuid, boolean) to authenticated;
