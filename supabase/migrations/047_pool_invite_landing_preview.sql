-- Invite landing: pool name + inviter profile (sharer or pool admin). Invite-safe fields only.
-- Viewer state: membership + pending join request for auth.uid().

drop function if exists public.get_pool_by_invite_token(text);

create or replace function public.get_pool_by_invite_token(
  p_invite_token text,
  p_invited_by uuid default null
)
returns table (
  id uuid,
  name text,
  is_public boolean,
  inviter_kind text,
  inviter_display_name text,
  inviter_avatar_url text,
  inviter_avatar_letter text,
  inviter_avatar_colour text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.is_public,
    case
      when p_invited_by is not null and inv.id is not null then 'sharer'
      when nullif(trim(adm.display_name), '') is not null then 'admin'
      else 'anonymous'
    end as inviter_kind,
    case
      when p_invited_by is not null and inv.id is not null then nullif(trim(inv.display_name), '')
      else nullif(trim(adm.display_name), '')
    end as inviter_display_name,
    coalesce(inv.avatar_url, adm.avatar_url) as inviter_avatar_url,
    coalesce(inv.avatar_letter, adm.avatar_letter) as inviter_avatar_letter,
    coalesce(inv.avatar_colour, adm.avatar_colour) as inviter_avatar_colour
  from public.pools p
  join public.user_profiles adm on adm.id = p.admin_user_id
  left join public.user_profiles inv on inv.id = p_invited_by
  where p.invite_token = trim(coalesce(p_invite_token, ''))
    and p.is_closed = false;
$$;

revoke all on function public.get_pool_by_invite_token(text, uuid) from public;
grant execute on function public.get_pool_by_invite_token(text, uuid) to anon, authenticated;

create or replace function public.pool_invite_viewer_state(p_invite_token text)
returns table (
  pool_id uuid,
  is_member boolean,
  has_pending_request boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as pool_id,
    exists (
      select 1
      from public.pool_members pm
      where pm.pool_id = p.id
        and pm.user_id = auth.uid()
    ) as is_member,
    exists (
      select 1
      from public.pool_join_requests r
      where r.pool_id = p.id
        and r.user_id = auth.uid()
        and r.status = 'pending'
    ) as has_pending_request
  from public.pools p
  where p.invite_token = trim(coalesce(p_invite_token, ''))
    and p.is_closed = false;
$$;

revoke all on function public.pool_invite_viewer_state(text) from public;
grant execute on function public.pool_invite_viewer_state(text) to anon, authenticated;
