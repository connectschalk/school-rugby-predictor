-- Pool creation limit: up to 3 pools per user per competition (not global).

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
  v_schools_competition_id uuid;
  v_existing_admin_pools integer;
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

  select c.id into v_schools_competition_id
  from public.competitions c
  where c.slug = 'nextplay-schools' and c.is_active = true
  limit 1;

  if not public.is_app_admin(v_uid) then
    select count(*)::integer into v_existing_admin_pools
    from public.pools p
    where p.admin_user_id = v_uid
      and (
        p.competition_id = v_competition_id
        or (p.competition_id is null and v_competition_id = v_schools_competition_id)
      );

    if v_existing_admin_pools >= 3 then
      raise exception 'You can create up to 3 pools per competition.';
    end if;
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
