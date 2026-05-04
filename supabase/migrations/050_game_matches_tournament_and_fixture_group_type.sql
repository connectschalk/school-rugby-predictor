-- Tournament classification on fixtures + fixture_groups.group_type 'tournament'.

alter table public.game_matches
  add column if not exists tournament text;

alter table public.fixture_groups
  drop constraint if exists fixture_groups_group_type_check;

alter table public.fixture_groups
  add constraint fixture_groups_group_type_check
  check (group_type in ('province', 'league', 'festival', 'prestige', 'custom', 'tournament'));

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

  if v_group_type not in ('province', 'league', 'festival', 'prestige', 'custom', 'tournament') then
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
