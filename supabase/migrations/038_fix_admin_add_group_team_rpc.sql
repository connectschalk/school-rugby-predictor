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
  v_existing_group_id uuid;
  v_existing_team_name text;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'Only admins can manage group teams.';
  end if;

  v_team_name := trim(coalesce(p_team_name, ''));
  if v_team_name = '' then
    raise exception 'Team name is required.';
  end if;

  if not exists (
    select 1
    from public.fixture_groups fg
    where fg.id = p_group_id
  ) then
    raise exception 'Fixture group not found.';
  end if;

  -- Case-insensitive duplicate protection first, then return canonical stored row.
  select fgt.group_id, fgt.team_name
  into v_existing_group_id, v_existing_team_name
  from public.fixture_group_teams fgt
  where fgt.group_id = p_group_id
    and lower(fgt.team_name) = lower(v_team_name)
  limit 1;

  if v_existing_group_id is not null then
    return query
    select v_existing_group_id, v_existing_team_name;
    return;
  end if;

  insert into public.fixture_group_teams as fgt (group_id, team_name)
  values (p_group_id, v_team_name);

  return query
  select fgt.group_id, fgt.team_name
  from public.fixture_group_teams fgt
  where fgt.group_id = p_group_id
    and fgt.team_name = v_team_name
  limit 1;
end;
$$;

revoke all on function public.admin_add_group_team(uuid, text) from public;
grant execute on function public.admin_add_group_team(uuid, text) to authenticated;
