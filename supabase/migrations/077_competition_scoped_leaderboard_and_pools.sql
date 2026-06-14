-- Phase 3: competition-scoped leaderboard view and pool listing filters.

-- ---------------------------------------------------------------------------
-- Competition leaderboard (scores only from matches in that competition)
-- ---------------------------------------------------------------------------

create or replace view public.predict_score_competition_leaderboard as
select
  gm.competition_id,
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
  coalesce(sum(ups.margin_difference), 0)::bigint as cumulative_margin_error,
  round(
    (avg(ups.margin_difference::numeric)),
    2
  ) as average_margin_error,
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
  and gm.competition_id is not null
group by gm.competition_id, extract(year from gm.kickoff_time)::integer, ups.user_id;

grant select on public.predict_score_competition_leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------------
-- my_pools: include competition_id for client-side / RPC filtering
-- ---------------------------------------------------------------------------

create or replace function public.my_pools()
returns table (
  id uuid,
  name text,
  admin_user_id uuid,
  created_by uuid,
  is_public boolean,
  invite_token text,
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
-- search_public_pools: optional competition filter
-- ---------------------------------------------------------------------------

drop function if exists public.search_public_pools(text, integer);

create or replace function public.search_public_pools(
  p_query text default null,
  p_limit integer default 20,
  p_competition_id uuid default null
)
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
    and (p_competition_id is null or p.competition_id = p_competition_id)
    and (
      p_query is null
      or trim(p_query) = ''
      or p.name ilike '%' || trim(p_query) || '%'
    )
  group by p.id, p.name, p.admin_user_id, p.created_at
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.search_public_pools(text, integer, uuid) from public;
grant execute on function public.search_public_pools(text, integer, uuid) to authenticated;
