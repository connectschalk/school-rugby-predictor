-- Pools MVP + scoring update (winner 2, margin up to 1.0, closest bonus 0.5)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Pools core tables
-- ---------------------------------------------------------------------------

create table if not exists public.pools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 80),
  admin_user_id uuid not null references auth.users (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  is_public boolean not null default false,
  invite_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pools_admin_user_id_idx on public.pools (admin_user_id);
create index if not exists pools_public_name_idx on public.pools (is_public, name);

create table if not exists public.pool_members (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (pool_id, user_id)
);

create index if not exists pool_members_pool_id_idx on public.pool_members (pool_id);
create index if not exists pool_members_user_id_idx on public.pool_members (user_id);

create table if not exists public.pool_join_requests (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  unique (pool_id, user_id)
);

create index if not exists pool_join_requests_pool_status_idx
  on public.pool_join_requests (pool_id, status, requested_at desc);
create index if not exists pool_join_requests_user_id_idx
  on public.pool_join_requests (user_id, requested_at desc);

create table if not exists public.pool_matches (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  match_id uuid not null references public.game_matches (id) on delete cascade,
  week_start_date date not null,
  added_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (pool_id, match_id, week_start_date)
);

create index if not exists pool_matches_pool_week_idx on public.pool_matches (pool_id, week_start_date);
create index if not exists pool_matches_match_id_idx on public.pool_matches (match_id);

create table if not exists public.pool_comments (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools (id) on delete cascade,
  match_id uuid references public.game_matches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists pool_comments_pool_created_idx on public.pool_comments (pool_id, created_at desc);
create index if not exists pool_comments_match_idx on public.pool_comments (match_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pools_touch_updated_at on public.pools;
create trigger trg_pools_touch_updated_at
before update on public.pools
for each row
execute function public.touch_updated_at();

create or replace function public.current_pool_week_start(p_at timestamptz default now())
returns date
language sql
stable
as $$
  select date_trunc('week', p_at at time zone 'utc')::date;
$$;

create or replace function public.is_pool_member(p_pool_id uuid, p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.pool_members pm
    where pm.pool_id = p_pool_id
      and pm.user_id = p_user_id
  );
$$;

create or replace function public.is_pool_admin(p_pool_id uuid, p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.pools p
    where p.id = p_pool_id
      and p.admin_user_id = p_user_id
      and p.is_closed = false
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.pools enable row level security;
alter table public.pool_members enable row level security;
alter table public.pool_join_requests enable row level security;
alter table public.pool_matches enable row level security;
alter table public.pool_comments enable row level security;

drop policy if exists pools_member_select on public.pools;
create policy pools_member_select
on public.pools for select
to authenticated
using (public.is_pool_member(id, auth.uid()));

drop policy if exists pool_members_member_select on public.pool_members;
create policy pool_members_member_select
on public.pool_members for select
to authenticated
using (public.is_pool_member(pool_id, auth.uid()));

drop policy if exists pool_join_requests_self_or_admin_select on public.pool_join_requests;
create policy pool_join_requests_self_or_admin_select
on public.pool_join_requests for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_pool_admin(pool_id, auth.uid())
);

drop policy if exists pool_matches_member_select on public.pool_matches;
create policy pool_matches_member_select
on public.pool_matches for select
to authenticated
using (public.is_pool_member(pool_id, auth.uid()));

drop policy if exists pool_comments_member_select on public.pool_comments;
create policy pool_comments_member_select
on public.pool_comments for select
to authenticated
using (public.is_pool_member(pool_id, auth.uid()));

drop policy if exists pool_comments_member_insert on public.pool_comments;
create policy pool_comments_member_insert
on public.pool_comments for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_pool_member(pool_id, auth.uid())
);

-- writes are RPC-only
revoke all on public.pools from anon, authenticated;
revoke all on public.pool_members from anon, authenticated;
revoke all on public.pool_join_requests from anon, authenticated;
revoke all on public.pool_matches from anon, authenticated;

grant select on public.pools, public.pool_members, public.pool_join_requests, public.pool_matches to authenticated;
grant select, insert on public.pool_comments to authenticated;

-- ---------------------------------------------------------------------------
-- Pool RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_pool(
  p_name text,
  p_is_public boolean default false
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

  insert into public.pools (name, admin_user_id, created_by, is_public)
  values (trim(p_name), v_uid, v_uid, coalesce(p_is_public, false))
  returning * into v_pool;

  insert into public.pool_members (pool_id, user_id)
  values (v_pool.id, v_uid)
  on conflict (pool_id, user_id) do nothing;

  return v_pool;
end;
$$;

create or replace function public.search_public_pools(p_query text default null, p_limit integer default 20)
returns table (
  id uuid,
  name text,
  admin_user_id uuid,
  member_count bigint,
  created_at timestamptz
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
    count(pm.user_id)::bigint as member_count,
    p.created_at
  from public.pools p
  left join public.pool_members pm on pm.pool_id = p.id
  where p.is_public = true
    and p.is_closed = false
    and (
      p_query is null
      or trim(p_query) = ''
      or p.name ilike '%' || trim(p_query) || '%'
    )
  group by p.id
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

create or replace function public.request_pool_join(
  p_pool_id uuid,
  p_invite_token text default null
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

  if v_pool.is_public = false and coalesce(trim(p_invite_token), '') <> v_pool.invite_token then
    raise exception 'valid invite token required';
  end if;

  insert into public.pool_join_requests (pool_id, user_id, status, requested_at, reviewed_at, reviewed_by)
  values (p_pool_id, v_uid, 'pending', now(), null, null)
  on conflict (pool_id, user_id)
  do update set status = 'pending', requested_at = now(), reviewed_at = null, reviewed_by = null
  returning * into v_req;

  return v_req;
end;
$$;

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

  if v_action not in ('approve', 'reject') then
    raise exception 'action must be approve or reject';
  end if;

  select * into v_req
  from public.pool_join_requests r
  where r.id = p_request_id;

  if not found then
    raise exception 'request not found';
  end if;

  if not public.is_pool_admin(v_req.pool_id, v_uid) then
    raise exception 'admin only';
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

create or replace function public.remove_pool_member(
  p_pool_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.is_pool_admin(p_pool_id, v_uid) then
    raise exception 'admin only';
  end if;

  if exists (
    select 1 from public.pools p
    where p.id = p_pool_id
      and p.admin_user_id = p_user_id
  ) then
    raise exception 'cannot remove current admin';
  end if;

  delete from public.pool_members
  where pool_id = p_pool_id
    and user_id = p_user_id;
end;
$$;

create or replace function public.leave_pool(
  p_pool_id uuid,
  p_new_admin_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_other_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.is_pool_member(p_pool_id, v_uid) then
    raise exception 'not a member';
  end if;

  select exists (
    select 1 from public.pools p
    where p.id = p_pool_id and p.admin_user_id = v_uid
  ) into v_is_admin;

  if v_is_admin then
    select count(*)::integer
      into v_other_count
    from public.pool_members pm
    where pm.pool_id = p_pool_id
      and pm.user_id <> v_uid;

    if v_other_count = 0 then
      delete from public.pools where id = p_pool_id;
      return;
    end if;

    if p_new_admin_user_id is null then
      raise exception 'new admin required before leaving';
    end if;

    if not exists (
      select 1
      from public.pool_members pm
      where pm.pool_id = p_pool_id
        and pm.user_id = p_new_admin_user_id
    ) then
      raise exception 'new admin must be an existing member';
    end if;

    update public.pools
    set admin_user_id = p_new_admin_user_id
    where id = p_pool_id;
  end if;

  delete from public.pool_members
  where pool_id = p_pool_id
    and user_id = v_uid;
end;
$$;

create or replace function public.upsert_pool_matches(
  p_pool_id uuid,
  p_match_ids uuid[],
  p_week_start date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week date := coalesce(p_week_start, public.current_pool_week_start());
  v_inserted integer := 0;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.is_pool_admin(p_pool_id, v_uid) then
    raise exception 'admin only';
  end if;

  delete from public.pool_matches
  where pool_id = p_pool_id
    and week_start_date = v_week;

  insert into public.pool_matches (pool_id, match_id, week_start_date, added_by)
  select
    p_pool_id,
    gm.id,
    v_week,
    v_uid
  from public.game_matches gm
  where gm.id = any(coalesce(p_match_ids, array[]::uuid[]))
    and (gm.kickoff_time at time zone 'utc')::date between v_week and (v_week + 5)
  on conflict (pool_id, match_id, week_start_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.pool_effective_matches(
  p_pool_id uuid,
  p_week_start date default null
)
returns table (
  match_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with week_ctx as (
    select coalesce(p_week_start, public.current_pool_week_start())::date as week_start
  ),
  selected as (
    select pm.match_id
    from public.pool_matches pm
    join week_ctx w on w.week_start = pm.week_start_date
    where pm.pool_id = p_pool_id
  ),
  defaults as (
    select gm.id as match_id
    from public.game_matches gm
    join week_ctx w on true
    where gm.is_featured = true
      and (gm.kickoff_time at time zone 'utc')::date between w.week_start and (w.week_start + 5)
    order by gm.featured_order nulls last, gm.kickoff_time asc
    limit 10
  )
  select s.match_id from selected s
  union all
  select d.match_id
  from defaults d
  where not exists (select 1 from selected);
$$;

create or replace function public.pool_leaderboard(
  p_pool_id uuid,
  p_week_start date default null
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  avatar_letter text,
  avatar_colour text,
  joined_at timestamptz,
  total_points numeric,
  total_margin_difference bigint,
  average_margin_difference numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with em as (
    select match_id from public.pool_effective_matches(p_pool_id, p_week_start)
  )
  select
    pm.user_id,
    coalesce(nullif(trim(up.display_name), ''), 'Player') as display_name,
    up.avatar_url,
    up.avatar_letter,
    up.avatar_colour,
    pm.joined_at,
    coalesce(sum(ups.total_points), 0)::numeric as total_points,
    coalesce(sum(ups.margin_difference), 0)::bigint as total_margin_difference,
    coalesce(avg(ups.margin_difference::numeric), null) as average_margin_difference
  from public.pool_members pm
  left join public.user_profiles up on up.id = pm.user_id
  left join public.user_prediction_scores ups
    on ups.user_id = pm.user_id
   and ups.match_id in (select match_id from em)
   and ups.scored_at >= pm.joined_at
  where pm.pool_id = p_pool_id
  group by pm.user_id, up.display_name, up.avatar_url, up.avatar_letter, up.avatar_colour, pm.joined_at;
$$;

create or replace function public.pool_pending_request_count(p_pool_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.pool_join_requests r
  where r.pool_id = p_pool_id
    and r.status = 'pending';
$$;

create or replace function public.pool_match_predictions_for_viewer(
  p_pool_id uuid,
  p_match_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  avatar_letter text,
  avatar_colour text,
  is_viewer boolean,
  reveal_allowed boolean,
  predicted_winner text,
  predicted_margin integer,
  is_locked boolean,
  locked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with ctx as (
    select
      auth.uid() as viewer_id,
      gm.kickoff_time,
      now() >= gm.kickoff_time as kickoff_passed
    from public.game_matches gm
    where gm.id = p_match_id
  ),
  viewer_pred as (
    select up.is_locked
    from public.user_predictions up
    join ctx on true
    where up.match_id = p_match_id
      and up.user_id = ctx.viewer_id
    limit 1
  )
  select
    pm.user_id,
    coalesce(nullif(trim(upf.display_name), ''), 'Player') as display_name,
    upf.avatar_url,
    upf.avatar_letter,
    upf.avatar_colour,
    (pm.user_id = ctx.viewer_id) as is_viewer,
    (
      (pm.user_id = ctx.viewer_id)
      or ctx.kickoff_passed
      or coalesce((select vp.is_locked from viewer_pred vp), false)
    ) as reveal_allowed,
    case
      when (pm.user_id = ctx.viewer_id)
        or ctx.kickoff_passed
        or coalesce((select vp.is_locked from viewer_pred vp), false)
      then upp.predicted_winner
      else null
    end as predicted_winner,
    case
      when (pm.user_id = ctx.viewer_id)
        or ctx.kickoff_passed
        or coalesce((select vp.is_locked from viewer_pred vp), false)
      then upp.predicted_margin
      else null
    end as predicted_margin,
    upp.is_locked,
    upp.locked_at
  from public.pool_members pm
  join ctx on true
  left join public.user_profiles upf on upf.id = pm.user_id
  left join public.user_predictions upp on upp.user_id = pm.user_id and upp.match_id = p_match_id
  where pm.pool_id = p_pool_id
    and public.is_pool_member(p_pool_id, ctx.viewer_id);
$$;

revoke all on function public.create_pool(text, boolean) from public;
revoke all on function public.search_public_pools(text, integer) from public;
revoke all on function public.request_pool_join(uuid, text) from public;
revoke all on function public.review_pool_join_request(uuid, text) from public;
revoke all on function public.remove_pool_member(uuid, uuid) from public;
revoke all on function public.leave_pool(uuid, uuid) from public;
revoke all on function public.upsert_pool_matches(uuid, uuid[], date) from public;
revoke all on function public.pool_effective_matches(uuid, date) from public;
revoke all on function public.pool_leaderboard(uuid, date) from public;
revoke all on function public.pool_pending_request_count(uuid) from public;
revoke all on function public.pool_match_predictions_for_viewer(uuid, uuid) from public;

grant execute on function public.create_pool(text, boolean) to authenticated;
grant execute on function public.search_public_pools(text, integer) to authenticated;
grant execute on function public.request_pool_join(uuid, text) to authenticated;
grant execute on function public.review_pool_join_request(uuid, text) to authenticated;
grant execute on function public.remove_pool_member(uuid, uuid) to authenticated;
grant execute on function public.leave_pool(uuid, uuid) to authenticated;
grant execute on function public.upsert_pool_matches(uuid, uuid[], date) to authenticated;
grant execute on function public.pool_effective_matches(uuid, date) to authenticated;
grant execute on function public.pool_leaderboard(uuid, date) to authenticated;
grant execute on function public.pool_pending_request_count(uuid) to authenticated;
grant execute on function public.pool_match_predictions_for_viewer(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Scoring update (global + pool consumers)
-- ---------------------------------------------------------------------------

drop view if exists public.predict_score_season_leaderboard;

alter table public.user_prediction_scores
  alter column winner_points type numeric(4,1) using winner_points::numeric(4,1),
  alter column margin_points type numeric(4,1) using margin_points::numeric(4,1),
  alter column total_points type numeric(4,1) using total_points::numeric(4,1);

create or replace function public.score_predictions_for_match (p_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_home_score integer;
  v_away_score integer;
  v_status text;
  v_actual_winner text;
  v_actual_margin integer;
  v_inserted integer;
begin
  select gm.home_score, gm.away_score, gm.status
    into v_home_score, v_away_score, v_status
  from public.game_matches gm
  where gm.id = p_match_id;

  if not found then
    raise exception 'game_matches row not found for id %', p_match_id;
  end if;

  if v_status is distinct from 'completed' then
    raise exception 'match must have status completed (got %)', v_status;
  end if;

  if v_home_score is null or v_away_score is null then
    raise exception 'home_score and away_score must be set';
  end if;

  v_actual_margin := abs(v_home_score - v_away_score);
  v_actual_winner := case
    when v_home_score > v_away_score then 'home'
    when v_away_score > v_home_score then 'away'
    else 'draw'
  end;

  delete from public.user_prediction_scores ups
  where ups.match_id = p_match_id;

  with base as (
    select
      up.id as prediction_id,
      up.match_id,
      up.user_id,
      up.predicted_winner,
      up.predicted_margin,
      (up.predicted_winner = v_actual_winner)::boolean as winner_correct,
      abs(up.predicted_margin - v_actual_margin) as margin_diff_abs
    from public.user_predictions up
    where up.match_id = p_match_id
  ),
  min_diff as (
    select min(b.margin_diff_abs) as m from base b
  )
  insert into public.user_prediction_scores (
    prediction_id,
    match_id,
    user_id,
    winner_correct,
    actual_winner,
    actual_margin,
    margin_difference,
    winner_points,
    margin_points,
    total_points,
    scored_at
  )
  select
    b.prediction_id,
    b.match_id,
    b.user_id,
    b.winner_correct,
    v_actual_winner,
    v_actual_margin,
    b.margin_diff_abs,
    case when b.winner_correct then 2.0 else 0.0 end::numeric(4,1) as winner_points,
    case
      when b.winner_correct = false then 0.0
      when b.margin_diff_abs = 0 then 1.0
      when b.margin_diff_abs = 1 then 0.8
      when b.margin_diff_abs = 2 then 0.6
      when b.margin_diff_abs = 3 then 0.4
      when b.margin_diff_abs = 4 then 0.2
      else 0.0
    end::numeric(4,1) as margin_points,
    (
      (case when b.winner_correct then 2.0 else 0.0 end)
      + (case
          when b.winner_correct = false then 0.0
          when b.margin_diff_abs = 0 then 1.0
          when b.margin_diff_abs = 1 then 0.8
          when b.margin_diff_abs = 2 then 0.6
          when b.margin_diff_abs = 3 then 0.4
          when b.margin_diff_abs = 4 then 0.2
          else 0.0
        end)
      + (case when b.margin_diff_abs = (select m from min_diff) then 0.5 else 0.0 end)
    )::numeric(4,1) as total_points,
    now()
  from base b;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.score_all_completed_matches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total integer := 0;
begin
  for r in
    select id
    from public.game_matches
    where status = 'completed'
      and home_score is not null
      and away_score is not null
  loop
    perform public.score_predictions_for_match(r.id);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

create or replace view public.predict_score_season_leaderboard as
select
  extract(year from gm.kickoff_time)::integer as season,
  ups.user_id,
  max(prof.display_name) as display_name,
  sum(ups.total_points)::numeric as total_points,
  count(*)::bigint as predictions_made,
  round(
    (sum(ups.total_points)::numeric / nullif(count(*)::numeric, 0)),
    2
  ) as avg_points_per_prediction,
  count(*) filter (
    where ups.winner_correct
      and ups.margin_difference is not null
      and ups.margin_difference = 0
  )::bigint as exact_margin_count,
  count(*) filter (where ups.winner_correct)::bigint as correct_winner_count,
  sum(ups.margin_points)::numeric as margin_points_total,
  round(
    (sum(ups.margin_points)::numeric / nullif(count(*)::numeric, 0)),
    2
  ) as margin_points_average,
  max(prof.avatar_url) as avatar_url,
  max(prof.avatar_letter) as avatar_letter,
  max(prof.avatar_colour) as avatar_colour
from public.user_prediction_scores ups
join public.game_matches gm on gm.id = ups.match_id
left join public.user_profiles prof on prof.id = ups.user_id
where gm.status = 'completed'
group by extract(year from gm.kickoff_time)::integer, ups.user_id;

grant select on public.predict_score_season_leaderboard to anon, authenticated;
grant execute on function public.score_all_completed_matches() to authenticated, service_role;
