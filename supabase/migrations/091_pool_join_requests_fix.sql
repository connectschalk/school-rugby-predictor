-- Pool join requests: admin visibility, app-admin access, duplicate protection, requester pending lookup.

create or replace function public.can_manage_pool(p_pool_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_app_admin(p_user_id)
    or exists (
      select 1
      from public.pools p
      where p.id = p_pool_id
        and p.admin_user_id = p_user_id
        and p.is_closed = false
    );
$$;

revoke all on function public.can_manage_pool(uuid, uuid) from public;
grant execute on function public.can_manage_pool(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- request_pool_join: block duplicate pending; keep invite/code rules
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

  select r.status
  into v_existing_status
  from public.pool_join_requests r
  where r.pool_id = p_pool_id
    and r.user_id = v_uid;

  if v_existing_status = 'pending' then
    raise exception 'request already sent';
  end if;

  if not v_pool.is_public then
    v_token_ok := coalesce(trim(p_invite_token), '') = v_pool.invite_token;
    v_code_ok := public.normalize_pool_join_code(p_join_code) = lower(v_pool.join_code);
    if not v_token_ok and not v_code_ok then
      raise exception 'valid invite token or pool code required';
    end if;
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
-- get_pool_join_requests (pool admin or app admin)
-- ---------------------------------------------------------------------------

create or replace function public.get_pool_join_requests(p_pool_id uuid)
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
    and public.can_manage_pool(p_pool_id, auth.uid())
  order by r.requested_at desc;
$$;

revoke all on function public.get_pool_join_requests(uuid) from public;
grant execute on function public.get_pool_join_requests(uuid) to authenticated;

create or replace function public.pending_pool_join_requests(p_pool_id uuid)
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
  select * from public.get_pool_join_requests(p_pool_id);
$$;

revoke all on function public.pending_pool_join_requests(uuid) from public;
grant execute on function public.pending_pool_join_requests(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Pending counts for pools the caller manages (badges)
-- ---------------------------------------------------------------------------

create or replace function public.my_admin_pool_pending_join_counts(
  p_competition_id uuid default null
)
returns table (
  pool_id uuid,
  pending_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with schools as (
    select c.id
    from public.competitions c
    where c.slug = 'nextplay-schools' and c.is_active = true
    limit 1
  )
  select
    r.pool_id,
    count(*)::bigint as pending_count
  from public.pool_join_requests r
  join public.pools p on p.id = r.pool_id
  cross join schools s
  where r.status = 'pending'
    and public.can_manage_pool(r.pool_id, auth.uid())
    and p.is_closed = false
    and (
      p_competition_id is null
      or coalesce(p.competition_id, s.id) = p_competition_id
    )
  group by r.pool_id;
$$;

revoke all on function public.my_admin_pool_pending_join_counts(uuid) from public;
grant execute on function public.my_admin_pool_pending_join_counts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Requester: pending join requests (button state after refresh)
-- ---------------------------------------------------------------------------

create or replace function public.my_pending_pool_join_requests(
  p_competition_id uuid default null
)
returns table (
  pool_id uuid,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with schools as (
    select c.id
    from public.competitions c
    where c.slug = 'nextplay-schools' and c.is_active = true
    limit 1
  )
  select
    r.pool_id,
    r.requested_at
  from public.pool_join_requests r
  join public.pools p on p.id = r.pool_id
  cross join schools s
  where r.user_id = auth.uid()
    and r.status = 'pending'
    and p.is_closed = false
    and (
      p_competition_id is null
      or coalesce(p.competition_id, s.id) = p_competition_id
    );
$$;

revoke all on function public.my_pending_pool_join_requests(uuid) from public;
grant execute on function public.my_pending_pool_join_requests(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Approve / decline (pool admin or app admin)
-- ---------------------------------------------------------------------------

create or replace function public.review_pool_join_request(
  p_request_id uuid,
  p_action text
)
returns public.pool_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.pool_join_requests;
  v_action text := lower(trim(p_action));
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if v_action not in ('approve', 'reject', 'decline') then
    raise exception 'action must be approve or decline';
  end if;

  if v_action = 'decline' then
    v_action := 'reject';
  end if;

  select * into v_req
  from public.pool_join_requests r
  where r.id = p_request_id;

  if not found then
    raise exception 'request not found';
  end if;

  if not public.can_manage_pool(v_req.pool_id, v_uid) then
    raise exception 'permission denied';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'request is not pending';
  end if;

  update public.pool_join_requests r
  set
    status = case when v_action = 'approve' then 'approved' else 'rejected' end,
    reviewed_at = now(),
    reviewed_by = v_uid
  where r.id = p_request_id
  returning * into v_req;

  if v_action = 'approve' then
    insert into public.pool_members (pool_id, user_id)
    values (v_req.pool_id, v_req.user_id)
    on conflict (pool_id, user_id) do nothing;
  end if;

  return v_req;
end;
$$;

revoke all on function public.review_pool_join_request(uuid, text) from public;
grant execute on function public.review_pool_join_request(uuid, text) to authenticated;

create or replace function public.approve_pool_join_request(p_request_id uuid)
returns public.pool_join_requests
language sql
security definer
set search_path = public
as $$
  select public.review_pool_join_request(p_request_id, 'approve');
$$;

create or replace function public.decline_pool_join_request(p_request_id uuid)
returns public.pool_join_requests
language sql
security definer
set search_path = public
as $$
  select public.review_pool_join_request(p_request_id, 'decline');
$$;

revoke all on function public.approve_pool_join_request(uuid) from public;
revoke all on function public.decline_pool_join_request(uuid) from public;
grant execute on function public.approve_pool_join_request(uuid) to authenticated;
grant execute on function public.decline_pool_join_request(uuid) to authenticated;
