-- Security Advisor: restrict public access to sensitive columns.
-- Safe reads use *_public views; RLS policies use SECURITY DEFINER helpers where needed.

-- ---------------------------------------------------------------------------
-- Helpers for RLS (bypass game_matches RLS for policy checks only)
-- ---------------------------------------------------------------------------

create or replace function public.game_match_exists_for_policy(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.game_matches g where g.id = p_match_id);
$$;

create or replace function public.game_match_allows_user_prediction_write(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_matches g
    where g.id = p_match_id
      and g.status = 'upcoming'
      and g.kickoff_time > now()
  );
$$;

revoke all on function public.game_match_exists_for_policy(uuid) from public;
revoke all on function public.game_match_allows_user_prediction_write(uuid) from public;
grant execute on function public.game_match_exists_for_policy(uuid) to authenticated;
grant execute on function public.game_match_allows_user_prediction_write(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public views (non-sensitive columns only)
-- ---------------------------------------------------------------------------

create or replace view public.user_profiles_public as
select
  id,
  display_name,
  avatar_url,
  avatar_letter,
  avatar_colour
from public.user_profiles;

create or replace view public.predictor_profiles_public as
select
  user_id,
  display_name,
  username,
  avatar_url,
  avatar_letter,
  avatar_colour
from public.predictor_profiles;

create or replace view public.game_matches_public as
select
  id,
  home_team,
  away_team,
  kickoff_time,
  status,
  home_score,
  away_score,
  penalty_winner,
  created_at,
  is_featured,
  featured_order,
  prediction_cutoff_time,
  province_group,
  league_group,
  is_prestige,
  competition_id,
  source_type,
  verification_status,
  fixture_key,
  fixture_round,
  external_id,
  tournament,
  home_team_province,
  away_team_province,
  is_interprovincial,
  is_prestige_match,
  has_wp_elite_team
from public.game_matches;

create or replace view public.user_prediction_scores_public as
select
  id,
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
from public.user_prediction_scores ups
where exists (
  select 1
  from public.game_matches gm
  where gm.id = ups.match_id
    and gm.status = 'completed'
);

grant select on public.user_profiles_public to anon, authenticated;
grant select on public.predictor_profiles_public to anon, authenticated;
grant select on public.game_matches_public to anon, authenticated;
grant select on public.user_prediction_scores_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Drop over-broad table policies
-- ---------------------------------------------------------------------------

drop policy if exists "user_profiles_select_public_rankings" on public.user_profiles;
drop policy if exists predictor_profiles_select_public_rankings on public.predictor_profiles;
drop policy if exists "user_prediction_scores_select_public" on public.user_prediction_scores;
drop policy if exists "game_matches_select_public" on public.game_matches;

-- ---------------------------------------------------------------------------
-- Least-privilege table policies
-- ---------------------------------------------------------------------------

drop policy if exists user_prediction_scores_select_own on public.user_prediction_scores;
create policy user_prediction_scores_select_own
on public.user_prediction_scores for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_prediction_scores_select_admin on public.user_prediction_scores;
create policy user_prediction_scores_select_admin
on public.user_prediction_scores for select
to authenticated
using (public.is_app_admin(auth.uid()));

drop policy if exists game_matches_select_admin on public.game_matches;
create policy game_matches_select_admin
on public.game_matches for select
to authenticated
using (public.is_app_admin(auth.uid()));

-- user_predictions: stop direct game_matches subqueries (RLS would block)
drop policy if exists "user_predictions_insert_own_upcoming" on public.user_predictions;
create policy "user_predictions_insert_own_upcoming"
on public.user_predictions for insert
to authenticated
with check (
  auth.uid() = user_id
  and coalesce(is_locked, false) = false
  and public.game_match_allows_user_prediction_write(match_id)
);

drop policy if exists "user_predictions_update_own_upcoming" on public.user_predictions;
create policy "user_predictions_update_own_upcoming"
on public.user_predictions for update
to authenticated
using (
  auth.uid() = user_id
  and coalesce(user_predictions.is_locked, false) = false
  and public.game_match_allows_user_prediction_write(user_predictions.match_id)
)
with check (
  auth.uid() = user_id
  and public.game_match_allows_user_prediction_write(match_id)
);

-- game_match_comments insert
drop policy if exists "game_match_comments_insert_own" on public.game_match_comments;
create policy "game_match_comments_insert_own"
on public.game_match_comments for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.game_match_exists_for_policy(match_id)
);

-- memory_map_events: authenticated only (was open insert)
drop policy if exists memory_map_events_insert on public.memory_map_events;
create policy memory_map_events_insert on public.memory_map_events
for insert to authenticated
with check (true);

-- ---------------------------------------------------------------------------
-- Legacy / internal tables without RLS
-- ---------------------------------------------------------------------------

alter table if exists public.prediction_history enable row level security;
alter table if exists public.consistency_model_settings enable row level security;

drop policy if exists prediction_history_admin_select on public.prediction_history;
create policy prediction_history_admin_select
on public.prediction_history for select
to authenticated
using (public.is_app_admin(auth.uid()));

drop policy if exists consistency_model_settings_admin_select on public.consistency_model_settings;
create policy consistency_model_settings_admin_select
on public.consistency_model_settings for select
to authenticated
using (public.is_app_admin(auth.uid()));

drop policy if exists consistency_model_settings_admin_write on public.consistency_model_settings;
create policy consistency_model_settings_admin_write
on public.consistency_model_settings for all
to authenticated
using (public.is_app_admin(auth.uid()))
with check (public.is_app_admin(auth.uid()));

-- usage_events (analytics; may already exist in hosted DB)
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  page text,
  details jsonb not null default '{}'::jsonb,
  user_email text,
  session_id text
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'usage_events'
  ) then
    execute 'alter table public.usage_events enable row level security';

    execute 'drop policy if exists usage_events_insert_authenticated on public.usage_events';
    execute 'drop policy if exists usage_events_insert on public.usage_events';

    execute 'drop policy if exists usage_events_admin_select on public.usage_events';
    execute $p$
      create policy usage_events_admin_select
      on public.usage_events for select
      to authenticated
      using (public.is_app_admin(auth.uid()))
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Pool secrets: invite_token / join_code only for pool admin
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
    case when p.admin_user_id = auth.uid() then p.invite_token else null end,
    case when p.admin_user_id = auth.uid() then p.join_code else null end,
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

-- ---------------------------------------------------------------------------
-- Revoke direct anon SELECT on sensitive base tables (views remain public)
-- ---------------------------------------------------------------------------

revoke select on public.user_profiles from anon;
revoke select on public.predictor_profiles from anon;
revoke select on public.user_prediction_scores from anon;
revoke select on public.game_matches from anon;
