-- Resolve pool id/name/is_public by invite token (invite flow; no emails).

create or replace function public.get_pool_by_invite_token(p_invite_token text)
returns table (
  id uuid,
  name text,
  is_public boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.is_public
  from public.pools p
  where p.invite_token = trim(coalesce(p_invite_token, ''))
    and p.is_closed = false;
$$;

revoke all on function public.get_pool_by_invite_token(text) from public;
grant execute on function public.get_pool_by_invite_token(text) to anon, authenticated;
