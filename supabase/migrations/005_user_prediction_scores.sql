-- Scored rows for public Predict a Score (written only via SECURITY DEFINER function)

create table if not exists public.user_prediction_scores (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.user_predictions (id) on delete cascade,
  match_id uuid not null references public.game_matches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  winner_correct boolean not null,
  actual_winner text not null check (actual_winner in ('home', 'away', 'draw')),
  actual_margin integer not null,
  margin_difference integer,
  winner_points integer not null,
  margin_points integer not null,
  total_points integer not null,
  scored_at timestamptz not null default now(),
  unique (prediction_id)
);

create index if not exists user_prediction_scores_match_id_idx
  on public.user_prediction_scores (match_id);

create index if not exists user_prediction_scores_user_id_idx
  on public.user_prediction_scores (user_id);

alter table public.user_prediction_scores enable row level security;

-- Public read for leaderboards (UI shows only display_name / avatar_url from join)
create policy "user_prediction_scores_select_public"
on public.user_prediction_scores for select
to anon, authenticated
using (true);

-- So leaderboards can join names without exposing emails
create policy "user_profiles_select_public_rankings"
on public.user_profiles for select
to anon, authenticated
using (true);

-- ---------------------------------------------------------------------------
-- Idempotent scoring for one completed fixture (server-side only writes)
-- ---------------------------------------------------------------------------
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

  delete from public.user_prediction_scores ups
  where ups.match_id = p_match_id;

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
    up.id,
    up.match_id,
    up.user_id,
    (
      case
        when v_home_score = v_away_score then false
        when v_home_score > v_away_score and up.predicted_winner = 'home' then true
        when v_away_score > v_home_score and up.predicted_winner = 'away' then true
        else false
      end
    ) as winner_correct,
    (
      case
        when v_home_score > v_away_score then 'home'
        when v_away_score > v_home_score then 'away'
        else 'draw'
      end
    )::text as actual_winner,
    abs(v_home_score - v_away_score) as actual_margin,
    (
      case
        when v_home_score = v_away_score then null
        when v_home_score > v_away_score and up.predicted_winner = 'home' then
          abs(up.predicted_margin - (v_home_score - v_away_score))
        when v_away_score > v_home_score and up.predicted_winner = 'away' then
          abs(up.predicted_margin - (v_away_score - v_home_score))
        else null
      end
    ) as margin_difference,
    (
      case
        when v_home_score = v_away_score then 0
        when v_home_score > v_away_score and up.predicted_winner = 'home' then 2
        when v_away_score > v_home_score and up.predicted_winner = 'away' then 2
        else 0
      end
    ) as winner_points,
    (
      case
        when v_home_score = v_away_score then 0
        when v_home_score > v_away_score and up.predicted_winner = 'home' then
          case abs(up.predicted_margin - (v_home_score - v_away_score))
            when 0 then 5
            when 1 then 4
            when 2 then 3
            when 3 then 2
            when 4 then 1
            else 0
          end
        when v_away_score > v_home_score and up.predicted_winner = 'away' then
          case abs(up.predicted_margin - (v_away_score - v_home_score))
            when 0 then 5
            when 1 then 4
            when 2 then 3
            when 3 then 2
            when 4 then 1
            else 0
          end
        else 0
      end
    ) as margin_points,
    (
      (
        case
          when v_home_score = v_away_score then 0
          when v_home_score > v_away_score and up.predicted_winner = 'home' then 2
          when v_away_score > v_home_score and up.predicted_winner = 'away' then 2
          else 0
        end
      )
      +
      (
        case
          when v_home_score = v_away_score then 0
          when v_home_score > v_away_score and up.predicted_winner = 'home' then
            case abs(up.predicted_margin - (v_home_score - v_away_score))
              when 0 then 5
              when 1 then 4
              when 2 then 3
              when 3 then 2
              when 4 then 1
              else 0
            end
          when v_away_score > v_home_score and up.predicted_winner = 'away' then
            case abs(up.predicted_margin - (v_away_score - v_home_score))
              when 0 then 5
              when 1 then 4
              when 2 then 3
              when 3 then 2
              when 4 then 1
              else 0
            end
          else 0
        end
      )
    ) as total_points,
    now()
  from public.user_predictions up
  where up.match_id = p_match_id;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.score_predictions_for_match (uuid) from public;
grant execute on function public.score_predictions_for_match (uuid) to authenticated;
grant execute on function public.score_predictions_for_match (uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Season aggregates for /user-rankings (read-only)
-- ---------------------------------------------------------------------------
create or replace view public.predict_score_season_leaderboard as
select
  extract(year from gm.kickoff_time)::integer as season,
  ups.user_id,
  max(prof.display_name) as display_name,
  max(prof.avatar_url) as avatar_url,
  sum(ups.total_points)::bigint as total_points,
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
  count(*) filter (where ups.winner_correct)::bigint as correct_winner_count
from public.user_prediction_scores ups
join public.game_matches gm on gm.id = ups.match_id
left join public.user_profiles prof on prof.id = ups.user_id
where gm.status = 'completed'
group by extract(year from gm.kickoff_time)::integer, ups.user_id;

grant select on public.predict_score_season_leaderboard to anon, authenticated;
