-- Soccer scoring v2: max 3 points (exact / close / correct / wrong).

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
  v_scoring_mode text := 'rugby_margin';
  v_actual_winner text;
  v_actual_margin integer;
  v_actual_signed_margin integer;
  v_inserted integer;
begin
  select gm.home_score, gm.away_score, gm.status, coalesce(c.scoring_mode, 'rugby_margin')
    into v_home_score, v_away_score, v_status, v_scoring_mode
  from public.game_matches gm
  left join public.competitions c on c.id = gm.competition_id
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

  if v_scoring_mode = 'soccer_exact_score' then
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
          when up.predicted_home_score > up.predicted_away_score then 'home'
          when up.predicted_away_score > up.predicted_home_score then 'away'
          else 'draw'
        end
      ) = v_actual_winner as winner_correct,
      v_actual_winner,
      v_actual_margin,
      abs(
        (up.predicted_home_score - up.predicted_away_score)
        - (v_home_score - v_away_score)
      ) as margin_difference,
      0.0::numeric(4,1) as winner_points,
      0.0::numeric(4,1) as margin_points,
      (
        case
          when up.predicted_home_score = v_home_score
               and up.predicted_away_score = v_away_score then 3.0
          when (
            case
              when up.predicted_home_score > up.predicted_away_score then 'home'
              when up.predicted_away_score > up.predicted_home_score then 'away'
              else 'draw'
            end
          ) is distinct from v_actual_winner then 0.0
          when abs(up.predicted_home_score - v_home_score)
               + abs(up.predicted_away_score - v_away_score) <= 1 then 2.0
          when (up.predicted_home_score - up.predicted_away_score) = (v_home_score - v_away_score) then
            case
              when v_actual_winner = 'draw'
                and abs(up.predicted_home_score - v_home_score) <= 1
                and abs(up.predicted_away_score - v_away_score) <= 1 then 2.0
              when v_actual_winner = 'draw' then 1.0
              else 2.0
            end
          else 1.0
        end
      )::numeric(4,1) as total_points,
      now()
    from public.user_predictions up
    where up.match_id = p_match_id
      and up.predicted_home_score is not null
      and up.predicted_away_score is not null;

    get diagnostics v_inserted = row_count;
    return v_inserted;
  end if;

  v_actual_signed_margin := case
    when v_actual_winner = 'home' then -v_actual_margin
    when v_actual_winner = 'away' then v_actual_margin
    else 0
  end;

  with base as (
    select
      up.id as prediction_id,
      up.match_id,
      up.user_id,
      up.predicted_winner,
      up.predicted_margin,
      (up.predicted_winner = v_actual_winner)::boolean as winner_correct,
      abs(
        (case when up.predicted_winner = 'home' then -up.predicted_margin else up.predicted_margin end)
        - v_actual_signed_margin
      ) as margin_diff_abs
    from public.user_predictions up
    where up.match_id = p_match_id
      and up.predicted_winner is not null
      and up.predicted_margin is not null
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
from public.user_prediction_scores ups
join public.game_matches gm on gm.id = ups.match_id
left join public.user_profiles prof on prof.id = ups.user_id
where gm.status = 'completed'
  and gm.competition_id is not null
group by gm.competition_id, extract(year from gm.kickoff_time)::integer, ups.user_id;

grant execute on function public.score_predictions_for_match (uuid) to authenticated, service_role;
grant select on public.predict_score_competition_leaderboard to anon, authenticated;

-- Re-score completed soccer fixtures with the new rules.
do $$
declare
  r record;
begin
  for r in
    select gm.id
    from public.game_matches gm
    join public.competitions c on c.id = gm.competition_id
    where gm.status = 'completed'
      and gm.home_score is not null
      and gm.away_score is not null
      and c.scoring_mode = 'soccer_exact_score'
  loop
    perform public.score_predictions_for_match(r.id);
  end loop;
end;
$$;
