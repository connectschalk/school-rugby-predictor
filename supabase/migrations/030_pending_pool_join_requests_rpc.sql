-- Admin-facing pending join requests with display_name.

create or replace function public.pending_pool_join_requests(
  p_pool_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  status text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.user_id,
    coalesce(nullif(trim(up.display_name), ''), 'Player') as display_name,
    r.status,
    r.requested_at
  from public.pool_join_requests r
  left join public.user_profiles up on up.id = r.user_id
  where r.pool_id = p_pool_id
    and r.status = 'pending'
    and public.is_pool_admin(p_pool_id, auth.uid())
  order by r.requested_at desc;
$$;

revoke all on function public.pending_pool_join_requests(uuid) from public;
grant execute on function public.pending_pool_join_requests(uuid) to authenticated;
