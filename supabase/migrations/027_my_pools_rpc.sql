-- RPC for current user's pools + membership joined_at (no client-side pool_members / embed).

create or replace function public.my_pools()
returns table (
  id uuid,
  name text,
  admin_user_id uuid,
  created_by uuid,
  is_public boolean,
  invite_token text,
  is_closed boolean,
  created_at timestamptz,
  updated_at timestamptz,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.admin_user_id,
    p.created_by,
    p.is_public,
    p.invite_token,
    p.is_closed,
    p.created_at,
    p.updated_at,
    pm.joined_at
  from public.pool_members pm
  join public.pools p on p.id = pm.pool_id
  where pm.user_id = auth.uid()
    and p.is_closed = false
  order by p.created_at desc;
$$;

revoke all on function public.my_pools() from public;
grant execute on function public.my_pools() to authenticated;
