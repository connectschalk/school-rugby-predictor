-- Pool invite lookup by token only (competition resolved from pool row).
-- Fixes invite landing when admin user_profiles row is missing (use LEFT JOIN).

create or replace function public.get_pool_invite_by_token(
  p_token text,
  p_invited_by uuid default null
)
returns table (
  pool_id uuid,
  pool_name text,
  invite_token text,
  competition_id uuid,
  competition_slug text,
  competition_name text,
  competition_logo_url text,
  is_public boolean,
  is_closed boolean,
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
  with schools as (
    select c.id, c.slug, c.name, c.logo_url
    from public.competitions c
    where c.slug = 'nextplay-schools' and c.is_active = true
    limit 1
  )
  select
    p.id as pool_id,
    p.name as pool_name,
    p.invite_token,
    coalesce(p.competition_id, s.id) as competition_id,
    coalesce(c.slug, s.slug, 'nextplay-schools') as competition_slug,
    coalesce(c.name, s.name, 'NextPlay Schools') as competition_name,
    coalesce(c.logo_url, s.logo_url) as competition_logo_url,
    p.is_public,
    p.is_closed,
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
  left join public.competitions c on c.id = p.competition_id
  cross join schools s
  left join public.user_profiles adm on adm.id = p.admin_user_id
  left join public.user_profiles inv on inv.id = p_invited_by
  where p.invite_token = trim(coalesce(p_token, ''));
$$;

revoke all on function public.get_pool_invite_by_token(text, uuid) from public;
grant execute on function public.get_pool_invite_by_token(text, uuid) to anon, authenticated;

-- Keep legacy RPC; do not hide closed pools (UI distinguishes closed vs invalid).
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
    d.pool_id as id,
    d.pool_name as name,
    d.is_public,
    d.inviter_kind,
    d.inviter_display_name,
    d.inviter_avatar_url,
    d.inviter_avatar_letter,
    d.inviter_avatar_colour
  from public.get_pool_invite_by_token(p_invite_token, p_invited_by) d
  where not d.is_closed;
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
