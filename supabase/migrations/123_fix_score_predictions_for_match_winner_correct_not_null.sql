-- Ensure score_predictions_for_match never writes NULL winner_correct.
-- Fixes legacy soccer penalty draws where predicted_penalty_winner and predicted_winner
-- are both NULL (NULL IN (...) poisons boolean OR chains).

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
  v_penalty_winner text;
  v_scoring_mode text := 'rugby_margin';
  v_actual_winner text;
  v_scored_actual_winner text;
  v_actual_margin integer;
  v_actual_signed_margin integer;
  v_inserted integer;
begin
  select gm.home_score, gm.away_score, gm.status, gm.penalty_winner, coalesce(c.scoring_mode, 'rugby_margin')
    into v_home_score, v_away_score, v_status, v_penalty_winner, v_scoring_mode
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

  v_scored_actual_winner := case
    when v_actual_winner = 'draw' and v_penalty_winner in ('home', 'away') then v_penalty_winner
    else v_actual_winner
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
      case
        when v_actual_winner = 'draw' and v_penalty_winner in ('home', 'away') then
          case
            when up.predicted_penalty_winner is not null then
              up.predicted_penalty_winner = v_penalty_winner
            when up.predicted_winner is not null then
              up.predicted_winner in ('home', 'away')
              and up.predicted_winner = v_penalty_winner
            else
              false
          end
        else
          coalesce(
            (
              case
                when up.predicted_home_score > up.predicted_away_score then 'home'
                when up.predicted_away_score > up.predicted_home_score then 'away'
                else 'draw'
              end
            ) = v_actual_winner,
            false
          )
      end::boolean as winner_correct,
      v_scored_actual_winner as actual_winner,
      v_actual_margin,
      abs(
        (up.predicted_home_score - up.predicted_away_score)
        - (v_home_score - v_away_score)
      ) as margin_difference,
      0.0::numeric(4,1) as winner_points,
      0.0::numeric(4,1) as margin_points,
      (
        case
          when v_actual_winner = 'draw' and v_penalty_winner in ('home', 'away') then
            case
              when up.predicted_home_score = v_home_score
                   and up.predicted_away_score = v_away_score
                   and up.predicted_penalty_winner is not null
                   and up.predicted_penalty_winner = v_penalty_winner then 3.0
              when up.predicted_penalty_winner is not null
                   and up.predicted_penalty_winner = v_penalty_winner then 2.0
              when up.predicted_home_score = v_home_score
                   and up.predicted_away_score = v_away_score
                   and up.predicted_penalty_winner is null then 2.0
              when up.predicted_penalty_winner is null
                   and up.predicted_winner in ('home', 'away')
                   and up.predicted_winner = v_penalty_winner then 2.0
              when up.predicted_home_score = v_home_score
                   and up.predicted_away_score = v_away_score
                   and up.predicted_penalty_winner is not null
                   and up.predicted_penalty_winner is distinct from v_penalty_winner then 1.0
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
      coalesce(up.predicted_winner = v_actual_winner, false) as winner_correct,
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

revoke all on function public.score_predictions_for_match (uuid) from public;
grant execute on function public.score_predictions_for_match (uuid) to authenticated;
grant execute on function public.score_predictions_for_match (uuid) to service_role;

-- Post-deploy safety check (expect zero rows):
-- select * from public.user_prediction_scores where winner_correct is null;
