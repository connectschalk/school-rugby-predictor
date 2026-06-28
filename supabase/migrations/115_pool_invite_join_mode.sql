-- Per-pool invite link access: request approval vs automatic join.

alter table public.pools
  add column if not exists invite_join_mode text not null default 'request'
  check (invite_join_mode in ('request', 'auto'));

-- ---------------------------------------------------------------------------
-- request_pool_join: auto-join when invite link + invite_join_mode = auto
-- ---------------------------------------------------------------------------

create or replace function public.request_pool_join(
  p_pool_id uuid,
  p_invite_token text default null,
  p_join_code text default null
)
returns public.pool_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pool public.pools;
  v_req public.pool_join_requests;
  v_existing_status text;
  v_token_ok boolean;
  v_code_ok boolean;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_pool
  from public.pools
  where id = p_pool_id
    and is_closed = false;

  if not found then
    raise exception 'pool not found';
  end if;

  if exists (
    select 1
    from public.pool_members pm
    where pm.pool_id = p_pool_id
      and pm.user_id = v_uid
  ) then
    raise exception 'already a member';
  end if;

  v_token_ok := coalesce(trim(p_invite_token), '') = v_pool.invite_token;
  v_code_ok := public.normalize_pool_join_code(p_join_code) = lower(v_pool.join_code);

  if not v_pool.is_public then
    if not v_token_ok and not v_code_ok then
      raise exception 'valid invite token or pool code required';
    end if;
  end if;

  if v_pool.invite_join_mode = 'auto' and v_token_ok then
    insert into public.pool_members (pool_id, user_id)
    values (p_pool_id, v_uid)
    on conflict (pool_id, user_id) do nothing;

    insert into public.pool_join_requests (pool_id, user_id, status, requested_at, reviewed_at, reviewed_by)
    values (p_pool_id, v_uid, 'approved', now(), now(), v_pool.admin_user_id)
    on conflict (pool_id, user_id)
    do update set
      status = 'approved',
      requested_at = now(),
      reviewed_at = now(),
      reviewed_by = excluded.reviewed_by
    returning * into v_req;

    return v_req;
  end if;

  select r.status
  into v_existing_status
  from public.pool_join_requests r
  where r.pool_id = p_pool_id
    and r.user_id = v_uid;

  if v_existing_status = 'pending' then
    raise exception 'request already sent';
  end if;

  insert into public.pool_join_requests (pool_id, user_id, status, requested_at, reviewed_at, reviewed_by)
  values (p_pool_id, v_uid, 'pending', now(), null, null)
  on conflict (pool_id, user_id)
  do update set
    status = 'pending',
    requested_at = now(),
    reviewed_at = null,
    reviewed_by = null
  where public.pool_join_requests.status <> 'pending'
  returning * into v_req;

  if v_req.id is null then
    raise exception 'request already sent';
  end if;

  return v_req;
end;
$$;

revoke all on function public.request_pool_join(uuid, text, text) from public;
grant execute on function public.request_pool_join(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pool admin: update invite link access mode
-- ---------------------------------------------------------------------------

create or replace function public.update_pool_invite_join_mode(
  p_pool_id uuid,
  p_invite_join_mode text
)
returns public.pools
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mode text := lower(trim(coalesce(p_invite_join_mode, 'request')));
  v_pool public.pools;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if v_mode not in ('request', 'auto') then
    raise exception 'invalid invite join mode';
  end if;

  if not public.can_manage_pool(p_pool_id, v_uid) then
    raise exception 'forbidden';
  end if;

  update public.pools
  set
    invite_join_mode = v_mode,
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

revoke all on function public.update_pool_invite_join_mode(uuid, text) from public;
grant execute on function public.update_pool_invite_join_mode(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Invite preview includes invite_join_mode
-- ---------------------------------------------------------------------------

drop function if exists public.get_pool_invite_by_token(text, uuid);

create or replace function public.get_pool_invite_by_token(
  p_token text,
  p_invited_by uuid default null
)
returns table (
  pool_id uuid,
  pool_name text,
  pool_logo_url text,
  invite_token text,
  competition_id uuid,
  competition_slug text,
  competition_name text,
  competition_logo_url text,
  is_public boolean,
  is_closed boolean,
  invite_join_mode text,
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
    p.logo_url as pool_logo_url,
    p.invite_token,
    coalesce(p.competition_id, s.id) as competition_id,
    coalesce(c.slug, s.slug, 'nextplay-schools') as competition_slug,
    coalesce(c.name, s.name, 'NextPlay Schools') as competition_name,
    coalesce(c.logo_url, s.logo_url) as competition_logo_url,
    p.is_public,
    p.is_closed,
    p.invite_join_mode,
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

-- ---------------------------------------------------------------------------
-- my_pools includes invite_join_mode
-- ---------------------------------------------------------------------------

drop function if exists public.my_pools();

create or replace function public.my_pools()
returns table (
  id uuid,
  name text,
  admin_user_id uuid,
  created_by uuid,
  is_public boolean,
  invite_token text,
  join_code text,
  invite_join_mode text,
  is_closed boolean,
  competition_id uuid,
  logo_url text,
  logo_path text,
  logo_updated_at timestamptz,
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
    p.join_code,
    p.invite_join_mode,
    p.is_closed,
    p.competition_id,
    p.logo_url,
    p.logo_path,
    p.logo_updated_at,
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
