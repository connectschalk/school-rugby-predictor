-- Pool admins (and app admins) can toggle whether a pool is public/searchable.

create or replace function public.update_pool_visibility(
  p_pool_id uuid,
  p_is_public boolean
)
returns public.pools
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pool public.pools;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.can_manage_pool(p_pool_id, v_uid) then
    raise exception 'forbidden';
  end if;

  update public.pools
  set
    is_public = coalesce(p_is_public, false),
    updated_at = now()
  where id = p_pool_id
    and is_closed = false
  returning * into v_pool;

  if not found then
    raise exception 'pool not found';
  end if;

  return v_pool;
end;
$$;

revoke all on function public.update_pool_visibility(uuid, boolean) from public;
grant execute on function public.update_pool_visibility(uuid, boolean) to authenticated;
