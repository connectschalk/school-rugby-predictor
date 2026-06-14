-- Pool short join codes: unique alphanumeric codes for search and join.

alter table public.pools
  add column if not exists join_code text;

create or replace function public.normalize_pool_join_code(p_raw text)
returns text
language sql
immutable
as $$
  select case
    when p_raw is null or trim(p_raw) = '' then null
    else lower(trim(p_raw))
  end;
$$;

create or replace function public.pool_join_code_prefix(p_competition_slug text)
returns text
language sql
immutable
as $$
  select case coalesce(nullif(trim(p_competition_slug), ''), 'nextplay-schools')
    when 'soccer-world-cup' then 'wc'
    when 'craven-week' then 'craven'
    when 'nextplay-schools' then 'pool'
    else 'pool'
  end;
$$;

create or replace function public.generate_pool_join_code(p_prefix text default 'pool')
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_prefix text;
  v_candidate text;
  v_try integer := 0;
begin
  v_prefix := regexp_replace(
    lower(coalesce(nullif(trim(p_prefix), ''), 'pool')),
    '[^a-z0-9]',
    '',
    'g'
  );
  if length(v_prefix) < 2 then
    v_prefix := 'pool';
  end if;
  if length(v_prefix) > 12 then
    v_prefix := left(v_prefix, 12);
  end if;

  loop
    v_try := v_try + 1;
    if v_try > 80 then
      raise exception 'could not generate unique pool join code';
    end if;
    v_candidate := v_prefix || lpad((floor(random() * 10000))::text, 4, '0');
    if length(v_candidate) > 20 then
      v_candidate := left(v_candidate, 20);
    end if;
    exit when not exists (
      select 1
      from public.pools p
      where lower(p.join_code) = v_candidate
    );
  end loop;

  return v_candidate;
end;
$$;

-- Backfill existing pools with unique generated codes.
do $$
declare
  r record;
  v_prefix text;
  v_code text;
begin
  for r in
    select p.id, c.slug as competition_slug
    from public.pools p
    left join public.competitions c on c.id = p.competition_id
    where p.join_code is null
    order by p.created_at asc
  loop
    v_prefix := public.pool_join_code_prefix(r.competition_slug);
    v_code := public.generate_pool_join_code(v_prefix);
    update public.pools
    set join_code = v_code
    where id = r.id;
  end loop;
end;
$$;

alter table public.pools
  alter column join_code set not null;

alter table public.pools
  drop constraint if exists pools_join_code_format_check;

alter table public.pools
  add constraint pools_join_code_format_check
  check (join_code ~ '^[a-z0-9]{4,20}$');

create unique index if not exists pools_join_code_lower_unique_idx
  on public.pools (lower(join_code));

-- ---------------------------------------------------------------------------
-- create_pool: optional custom join code or auto-generate
-- ---------------------------------------------------------------------------

drop function if exists public.create_pool(text, boolean, uuid);

create or replace function public.create_pool(
  p_name text,
  p_is_public boolean default false,
  p_competition_id uuid default null,
  p_join_code text default null
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
  v_competition_slug text;
  v_schools_competition_id uuid;
  v_existing_admin_pools integer;
  v_join_code text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if p_competition_id is not null then
    select c.id, c.slug into v_competition_id, v_competition_slug
    from public.competitions c
    where c.id = p_competition_id and c.is_active = true;
    if v_competition_id is null then
      raise exception 'invalid or inactive competition';
    end if;
  else
    select c.id, c.slug into v_competition_id, v_competition_slug
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

  v_join_code := public.normalize_pool_join_code(p_join_code);
  if v_join_code is not null then
    if v_join_code !~ '^[a-z0-9]{4,20}$' then
      raise exception 'Pool code must be 4–20 letters or numbers.';
    end if;
    if exists (
      select 1
      from public.pools p
      where lower(p.join_code) = v_join_code
    ) then
      raise exception 'This pool code is already taken. Please choose another.';
    end if;
  else
    v_join_code := public.generate_pool_join_code(
      public.pool_join_code_prefix(v_competition_slug)
    );
  end if;

  insert into public.pools (name, admin_user_id, created_by, is_public, competition_id, join_code)
  values (
    trim(p_name),
    v_uid,
    v_uid,
    coalesce(p_is_public, false),
    v_competition_id,
    v_join_code
  )
  returning * into v_pool;

  insert into public.pool_members (pool_id, user_id)
  values (v_pool.id, v_uid)
  on conflict (pool_id, user_id) do nothing;

  return v_pool;
end;
$$;

revoke all on function public.create_pool(text, boolean, uuid, text) from public;
grant execute on function public.create_pool(text, boolean, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- request_pool_join: private pools accept invite token OR join code
-- ---------------------------------------------------------------------------

drop function if exists public.request_pool_join(uuid, text);

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
  do update set status = 'pending', requested_at = now(), reviewed_at = null, reviewed_by = null
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function public.request_pool_join(uuid, text, text) from public;
grant execute on function public.request_pool_join(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- my_pools: include join_code
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
  is_closed boolean,
  competition_id uuid,
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
    p.is_closed,
    p.competition_id,
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

-- ---------------------------------------------------------------------------
-- search_public_pools: name, join_code, or invite_token
-- ---------------------------------------------------------------------------

drop function if exists public.search_public_pools(text, integer);
drop function if exists public.search_public_pools(text, integer, uuid);

create or replace function public.search_public_pools(
  p_query text default null,
  p_limit integer default 20,
  p_competition_id uuid default null
)
returns table (
  id uuid,
  name text,
  join_code text,
  admin_user_id uuid,
  admin_display_name text,
  competition_id uuid,
  competition_slug text,
  competition_name text,
  is_public boolean,
  member_count bigint,
  created_at timestamptz,
  match_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  with schools as (
    select c.id, c.slug, c.name
    from public.competitions c
    where c.slug = 'nextplay-schools' and c.is_active = true
    limit 1
  ),
  q as (
    select
      trim(coalesce(p_query, '')) as raw,
      lower(trim(coalesce(p_query, ''))) as lower_raw
  ),
  scoped as (
    select
      p.id,
      p.name,
      p.join_code,
      p.admin_user_id,
      coalesce(p.competition_id, s.id) as competition_id,
      coalesce(c.slug, s.slug, 'nextplay-schools') as competition_slug,
      coalesce(c.name, s.name, 'NextPlay Schools') as competition_name,
      p.is_public,
      p.is_closed,
      p.invite_token,
      p.created_at
    from public.pools p
    cross join schools s
    left join public.competitions c on c.id = p.competition_id
    where p.is_closed = false
      and (
        p_competition_id is null
        or coalesce(p.competition_id, s.id) = p_competition_id
      )
  ),
  exact_code as (
    select
      sc.id,
      sc.name,
      sc.join_code,
      sc.admin_user_id,
      nullif(trim(up.display_name), '') as admin_display_name,
      sc.competition_id,
      sc.competition_slug,
      sc.competition_name,
      sc.is_public,
      count(pm.user_id)::bigint as member_count,
      sc.created_at,
      'join_code'::text as match_kind,
      0 as sort_rank
    from scoped sc
    cross join q
    left join public.user_profiles up on up.id = sc.admin_user_id
    left join public.pool_members pm on pm.pool_id = sc.id
    where q.lower_raw ~ '^[a-z0-9]{4,20}$'
      and lower(sc.join_code) = q.lower_raw
    group by
      sc.id, sc.name, sc.join_code, sc.admin_user_id, up.display_name,
      sc.competition_id, sc.competition_slug, sc.competition_name,
      sc.is_public, sc.created_at
  ),
  exact_invite as (
    select
      sc.id,
      sc.name,
      sc.join_code,
      sc.admin_user_id,
      nullif(trim(up.display_name), '') as admin_display_name,
      sc.competition_id,
      sc.competition_slug,
      sc.competition_name,
      sc.is_public,
      count(pm.user_id)::bigint as member_count,
      sc.created_at,
      'invite_token'::text as match_kind,
      0 as sort_rank
    from scoped sc
    cross join q
    left join public.user_profiles up on up.id = sc.admin_user_id
    left join public.pool_members pm on pm.pool_id = sc.id
    where q.lower_raw ~ '^[a-f0-9]{32}$'
      and sc.invite_token = q.lower_raw
      and not exists (select 1 from exact_code ec where ec.id = sc.id)
    group by
      sc.id, sc.name, sc.join_code, sc.admin_user_id, up.display_name,
      sc.competition_id, sc.competition_slug, sc.competition_name,
      sc.is_public, sc.created_at
  ),
  name_matches as (
    select
      sc.id,
      sc.name,
      sc.join_code,
      sc.admin_user_id,
      nullif(trim(up.display_name), '') as admin_display_name,
      sc.competition_id,
      sc.competition_slug,
      sc.competition_name,
      sc.is_public,
      count(pm.user_id)::bigint as member_count,
      sc.created_at,
      'name'::text as match_kind,
      1 as sort_rank
    from scoped sc
    cross join q
    left join public.user_profiles up on up.id = sc.admin_user_id
    left join public.pool_members pm on pm.pool_id = sc.id
    where sc.is_public = true
      and q.raw <> ''
      and sc.name ilike '%' || q.raw || '%'
      and not exists (select 1 from exact_code ec where ec.id = sc.id)
      and not exists (select 1 from exact_invite ei where ei.id = sc.id)
    group by
      sc.id, sc.name, sc.join_code, sc.admin_user_id, up.display_name,
      sc.competition_id, sc.competition_slug, sc.competition_name,
      sc.is_public, sc.created_at
  ),
  combined as (
    select * from exact_code
    union all
    select * from exact_invite
    union all
    select * from name_matches
  )
  select
    c.id,
    c.name,
    c.join_code,
    c.admin_user_id,
    c.admin_display_name,
    c.competition_id,
    c.competition_slug,
    c.competition_name,
    c.is_public,
    c.member_count,
    c.created_at,
    c.match_kind
  from combined c
  order by c.sort_rank asc, c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.search_public_pools(text, integer, uuid) from public;
grant execute on function public.search_public_pools(text, integer, uuid) to authenticated;
