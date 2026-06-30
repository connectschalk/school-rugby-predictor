-- Resolve remaining Supabase Security Advisor lints not covered by 124.
-- Does not duplicate 124 work on user_profiles, game_matches, pools, etc.

-- ---------------------------------------------------------------------------
-- A. Enable RLS on legacy rugby / analytics tables
-- ---------------------------------------------------------------------------

alter table if exists public.teams enable row level security;
alter table if exists public.matches enable row level security;
alter table if exists public.prediction_history enable row level security;
alter table if exists public.usage_events enable row level security;
alter table if exists public.team_consistency enable row level security;

-- ---------------------------------------------------------------------------
-- B. public.teams — public school reference data; logo updates authenticated-only
-- ---------------------------------------------------------------------------

drop policy if exists "Allow authenticated update teams logo" on public.teams;
drop policy if exists teams_select_public on public.teams;
drop policy if exists teams_update_authenticated on public.teams;
drop policy if exists teams_admin_insert on public.teams;
drop policy if exists teams_admin_delete on public.teams;

create policy teams_select_public
on public.teams for select
to anon, authenticated
using (true);

create policy teams_update_authenticated
on public.teams for update
to authenticated
using (true)
with check (true);

create policy teams_admin_insert
on public.teams for insert
to authenticated
with check (public.is_app_admin(auth.uid()));

create policy teams_admin_delete
on public.teams for delete
to authenticated
using (public.is_app_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- C. public.matches — public historical rugby results; writes admin-only
-- ---------------------------------------------------------------------------

drop policy if exists matches_select_public on public.matches;
drop policy if exists matches_admin_insert on public.matches;
drop policy if exists matches_admin_update on public.matches;
drop policy if exists matches_admin_delete on public.matches;

create policy matches_select_public
on public.matches for select
to anon, authenticated
using (true);

create policy matches_admin_insert
on public.matches for insert
to authenticated
with check (public.is_app_admin(auth.uid()));

create policy matches_admin_update
on public.matches for update
to authenticated
using (public.is_app_admin(auth.uid()))
with check (public.is_app_admin(auth.uid()));

create policy matches_admin_delete
on public.matches for delete
to authenticated
using (public.is_app_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- D. public.prediction_history — model snapshots; admin-only (no user_id column)
-- ---------------------------------------------------------------------------

drop policy if exists prediction_history_admin_select on public.prediction_history;
drop policy if exists prediction_history_admin_insert on public.prediction_history;
drop policy if exists prediction_history_admin_update on public.prediction_history;
drop policy if exists prediction_history_admin_delete on public.prediction_history;

create policy prediction_history_admin_select
on public.prediction_history for select
to authenticated
using (public.is_app_admin(auth.uid()));

create policy prediction_history_admin_insert
on public.prediction_history for insert
to authenticated
with check (public.is_app_admin(auth.uid()));

create policy prediction_history_admin_update
on public.prediction_history for update
to authenticated
using (public.is_app_admin(auth.uid()))
with check (public.is_app_admin(auth.uid()));

create policy prediction_history_admin_delete
on public.prediction_history for delete
to authenticated
using (public.is_app_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- E. public.usage_events — no client access; service role inserts via API
-- ---------------------------------------------------------------------------

drop policy if exists usage_events_insert_authenticated on public.usage_events;
drop policy if exists usage_events_insert on public.usage_events;
drop policy if exists usage_events_admin_select on public.usage_events;

revoke all on table public.usage_events from anon;
revoke insert, update, delete on table public.usage_events from authenticated;
grant select on table public.usage_events to authenticated;

create policy usage_events_admin_select
on public.usage_events for select
to authenticated
using (public.is_app_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- F. public.team_consistency — safe team-level aggregates; writes admin-only
-- ---------------------------------------------------------------------------

drop policy if exists team_consistency_select_public on public.team_consistency;
drop policy if exists team_consistency_admin_write on public.team_consistency;

create policy team_consistency_select_public
on public.team_consistency for select
to anon, authenticated
using (true);

create policy team_consistency_admin_write
on public.team_consistency for all
to authenticated
using (public.is_app_admin(auth.uid()))
with check (public.is_app_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- G. SECURITY DEFINER views → security_invoker, join 124 safe views
-- ---------------------------------------------------------------------------

create or replace view public.predict_score_season_leaderboard
with (security_invoker = true)
as
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
from public.user_prediction_scores_public ups
join public.game_matches_public gm on gm.id = ups.match_id
left join public.user_profiles_public prof on prof.id = ups.user_id
group by extract(year from gm.kickoff_time)::integer, ups.user_id;

create or replace view public.predict_score_competition_leaderboard
with (security_invoker = true)
as
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
  count(*) filter (where ups.total_points = 3)::bigint as exact_score_count,
  count(*) filter (where ups.winner_correct)::bigint as correct_result_count,
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
from public.user_prediction_scores_public ups
join public.game_matches_public gm on gm.id = ups.match_id
left join public.user_profiles_public prof on prof.id = ups.user_id
where gm.competition_id is not null
group by gm.competition_id, extract(year from gm.kickoff_time)::integer, ups.user_id;

grant select on public.predict_score_season_leaderboard to anon, authenticated;
grant select on public.predict_score_competition_leaderboard to anon, authenticated;

-- match_edges exists only in some hosted DBs (network graph helper).
do $migration$
declare
  view_sql text;
begin
  if to_regclass('public.match_edges') is not null then
    select pg_get_viewdef('public.match_edges'::regclass, true) into view_sql;
    execute 'drop view public.match_edges';
    execute format(
      'create view public.match_edges with (security_invoker = true) as %s',
      view_sql
    );
    execute 'grant select on public.match_edges to anon, authenticated';
  end if;
end;
$migration$;
