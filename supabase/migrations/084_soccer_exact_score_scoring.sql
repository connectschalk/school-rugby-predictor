-- Soccer World Cup: exact-score predictions and competition-specific scoring modes.

alter table public.competitions
  add column if not exists scoring_mode text not null default 'rugby_margin'
    check (scoring_mode in ('rugby_margin', 'soccer_exact_score'));

comment on column public.competitions.scoring_mode is
  'rugby_margin = winner + margin; soccer_exact_score = home/away goals (0–20).';

update public.competitions
set scoring_mode = 'soccer_exact_score'
where slug = 'soccer-world-cup';

alter table public.user_predictions
  add column if not exists predicted_home_score integer,
  add column if not exists predicted_away_score integer;

alter table public.user_predictions
  alter column predicted_winner drop not null,
  alter column predicted_margin drop not null;

alter table public.user_predictions
  drop constraint if exists user_predictions_predicted_winner_check;

alter table public.user_predictions
  add constraint user_predictions_predicted_winner_check
  check (predicted_winner is null or predicted_winner in ('home', 'away', 'draw'));

alter table public.user_predictions
  drop constraint if exists user_predictions_predicted_margin_check;

alter table public.user_predictions
  add constraint user_predictions_predicted_margin_check
  check (predicted_margin is null or predicted_margin > 0);

alter table public.user_predictions
  drop constraint if exists user_predictions_predicted_home_score_check;

alter table public.user_predictions
  add constraint user_predictions_predicted_home_score_check
  check (predicted_home_score is null or (predicted_home_score >= 0 and predicted_home_score <= 20));

alter table public.user_predictions
  drop constraint if exists user_predictions_predicted_away_score_check;

alter table public.user_predictions
  add constraint user_predictions_predicted_away_score_check
  check (predicted_away_score is null or (predicted_away_score >= 0 and predicted_away_score <= 20));

alter table public.user_predictions
  drop constraint if exists user_predictions_shape_check;

alter table public.user_predictions
  add constraint user_predictions_shape_check
  check (
    (predicted_home_score is not null and predicted_away_score is not null)
    or (predicted_winner is not null and predicted_margin is not null)
  );

comment on column public.user_predictions.predicted_home_score is
  'Soccer exact-score mode: predicted home goals (0–20, normal time).';
comment on column public.user_predictions.predicted_away_score is
  'Soccer exact-score mode: predicted away goals (0–20, normal time).';

create or replace function public.user_predictions_reject_update_when_locked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_locked then
    raise exception 'LOCKED_PREDICTION_IMMUTABLE' using errcode = '23514';
  end if;
  if new.is_locked and not old.is_locked then
    if new.predicted_winner is distinct from old.predicted_winner
       or new.predicted_margin is distinct from old.predicted_margin
       or new.predicted_home_score is distinct from old.predicted_home_score
       or new.predicted_away_score is distinct from old.predicted_away_score then
      raise exception 'LOCK_SET_MUST_NOT_CHANGE_PICK' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

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
               and up.predicted_away_score = v_away_score then 4.0
          when (
            case
              when up.predicted_home_score > up.predicted_away_score then 'home'
              when up.predicted_away_score > up.predicted_home_score then 'away'
              else 'draw'
            end
          ) = v_actual_winner
          and v_actual_winner = 'draw' then 1.0
          when (
            case
              when up.predicted_home_score > up.predicted_away_score then 'home'
              when up.predicted_away_score > up.predicted_home_score then 'away'
              else 'draw'
            end
          ) = v_actual_winner
          and (up.predicted_home_score - up.predicted_away_score) = (v_home_score - v_away_score) then 2.0
          when (
            case
              when up.predicted_home_score > up.predicted_away_score then 'home'
              when up.predicted_away_score > up.predicted_home_score then 'away'
              else 'draw'
            end
          ) = v_actual_winner then 1.0
          else 0.0
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

create or replace function public.get_community_prediction_stats(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  gm record;
  v_scoring_mode text := 'rugby_margin';
  reveal_all boolean;
  user_locked boolean := false;
  total_c integer;
  home_c integer;
  away_c integer;
  draw_c integer;
  uw text;
  um integer;
  uh integer;
  ua integer;
  bucket_rows jsonb;
  top_scorelines jsonb;
  v_signed_avg numeric;
  v_avg_home numeric;
  v_avg_away numeric;
  community_avg_label text;
  home_pct numeric;
  away_pct numeric;
  draw_pct numeric;
  v_home_score integer;
  v_away_score integer;
  v_actual_winner text;
  v_actual_margin integer;
begin
  uw := null;
  um := null;
  uh := null;
  ua := null;
  bucket_rows := '[]'::jsonb;
  top_scorelines := '[]'::jsonb;
  community_avg_label := null;
  v_signed_avg := null;
  v_actual_winner := null;
  v_actual_margin := null;

  select gm_inner.*, coalesce(c.scoring_mode, 'rugby_margin') as scoring_mode
    into gm
  from public.game_matches gm_inner
  left join public.competitions c on c.id = gm_inner.competition_id
  where gm_inner.id = p_match_id;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'match_not_found');
  end if;

  v_scoring_mode := gm.scoring_mode;
  v_home_score := gm.home_score;
  v_away_score := gm.away_score;
  if v_home_score is not null and v_away_score is not null then
    v_actual_margin := abs(v_home_score - v_away_score);
    if v_home_score > v_away_score then
      v_actual_winner := 'home';
    elsif v_away_score > v_home_score then
      v_actual_winner := 'away';
    else
      v_actual_winner := 'draw';
    end if;
  end if;

  reveal_all := (gm.kickoff_time <= now());

  if uid is null then
    if not reveal_all then
      return jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
    end if;
  elsif not reveal_all then
    select exists (
      select 1
      from public.user_predictions up
      where up.match_id = p_match_id
        and up.user_id = uid
        and up.is_locked = true
    ) into user_locked;

    if not user_locked then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'lock_required',
        'match_id', p_match_id,
        'home_team', gm.home_team,
        'away_team', gm.away_team,
        'kickoff_time', gm.kickoff_time,
        'status', gm.status
      );
    end if;
  end if;

  if v_scoring_mode = 'soccer_exact_score' then
    select count(*)::integer into total_c
    from public.user_predictions
    where match_id = p_match_id
      and predicted_home_score is not null
      and predicted_away_score is not null;

    if total_c is null then total_c := 0; end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'home_score', x.home_score,
          'away_score', x.away_score,
          'count', x.cnt,
          'percentage', round((x.cnt::numeric / nullif(total_c, 0)) * 100, 1),
          'label', x.home_score::text || '-' || x.away_score::text
        )
        order by x.cnt desc, x.home_score desc, x.away_score desc
      ),
      '[]'::jsonb
    )
    into top_scorelines
    from (
      select
        predicted_home_score as home_score,
        predicted_away_score as away_score,
        count(*)::integer as cnt
      from public.user_predictions
      where match_id = p_match_id
        and predicted_home_score is not null
        and predicted_away_score is not null
      group by predicted_home_score, predicted_away_score
      order by cnt desc, predicted_home_score desc, predicted_away_score desc
      limit 3
    ) x;

    select
      count(*) filter (
        where predicted_home_score > predicted_away_score
      )::integer,
      count(*) filter (
        where predicted_away_score > predicted_home_score
      )::integer,
      count(*) filter (
        where predicted_home_score = predicted_away_score
      )::integer
    into home_c, away_c, draw_c
    from public.user_predictions
    where match_id = p_match_id
      and predicted_home_score is not null
      and predicted_away_score is not null;

    if total_c > 0 then
      home_pct := round(100.0 * home_c::numeric / total_c::numeric, 1);
      away_pct := round(100.0 * away_c::numeric / total_c::numeric, 1);
      draw_pct := round(100.0 * draw_c::numeric / total_c::numeric, 1);
    else
      home_pct := 0;
      away_pct := 0;
      draw_pct := 0;
    end if;

    select avg(predicted_home_score::numeric), avg(predicted_away_score::numeric)
    into v_avg_home, v_avg_away
    from public.user_predictions
    where match_id = p_match_id
      and predicted_home_score is not null
      and predicted_away_score is not null;

    if total_c = 0 or v_avg_home is null or v_avg_away is null then
      community_avg_label := null;
    else
      community_avg_label := round(v_avg_home)::text || '-' || round(v_avg_away)::text;
    end if;

    if uid is not null then
      select predicted_home_score, predicted_away_score
      into uh, ua
      from public.user_predictions
      where match_id = p_match_id and user_id = uid and is_locked = true
      limit 1;
    end if;

    return jsonb_build_object(
      'allowed', true,
      'reason', null,
      'scoring_mode', v_scoring_mode,
      'match_id', p_match_id,
      'home_team', gm.home_team,
      'away_team', gm.away_team,
      'kickoff_time', gm.kickoff_time,
      'status', gm.status,
      'home_score', v_home_score,
      'away_score', v_away_score,
      'actual_winner', v_actual_winner,
      'actual_margin', v_actual_margin,
      'total_predictions', total_c,
      'home_prediction_count', home_c,
      'away_prediction_count', away_c,
      'draw_prediction_count', draw_c,
      'home_prediction_pct', home_pct,
      'away_prediction_pct', away_pct,
      'draw_prediction_pct', draw_pct,
      'top_scorelines', top_scorelines,
      'community_average_label', community_avg_label,
      'user_locked_home_score', uh,
      'user_locked_away_score', ua
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (where predicted_winner = 'home')::integer,
    count(*) filter (where predicted_winner = 'away')::integer
  into total_c, home_c, away_c
  from public.user_predictions
  where match_id = p_match_id;

  if total_c is null then
    total_c := 0;
    home_c := 0;
    away_c := 0;
  end if;

  if total_c > 0 then
    home_pct := round(100.0 * home_c::numeric / total_c::numeric, 1);
    away_pct := round(100.0 * away_c::numeric / total_c::numeric, 1);
  else
    home_pct := 0;
    away_pct := 0;
  end if;

  select avg(
    case
      when predicted_winner = 'home' then -predicted_margin::numeric
      else predicted_margin::numeric
    end
  )
  into v_signed_avg
  from public.user_predictions
  where match_id = p_match_id;

  if total_c = 0 or v_signed_avg is null then
    community_avg_label := null;
  elsif round(v_signed_avg) = 0 then
    community_avg_label := 'Draw / even';
  elsif v_signed_avg < 0 then
    community_avg_label := gm.home_team || ' by ' || round(abs(v_signed_avg))::text;
  else
    community_avg_label := gm.away_team || ' by ' || round(v_signed_avg)::text;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'side', x.side,
        'bucket', x.bucket,
        'percentage', round((x.cnt::numeric / nullif(total_c, 0)) * 100, 1),
        'team_name', case x.side when 'home' then gm.home_team else gm.away_team end
      )
      order by
        case when x.side = 'home' then 0 else 1 end,
        case x.side
          when 'home' then
            case x.bucket
              when '20+' then 1
              when '15' then 2
              when '10' then 3
              when '5' then 4
              else 99
            end
          else
            case x.bucket
              when '5' then 1
              when '10' then 2
              when '15' then 3
              when '20+' then 4
              else 99
            end
        end
    ),
    '[]'::jsonb
  )
  into bucket_rows
  from (
    select
      t.side,
      t.bucket,
      count(*)::integer as cnt
    from (
      select
        predicted_winner as side,
        case
          when predicted_margin between 1 and 5 then '5'
          when predicted_margin between 6 and 10 then '10'
          when predicted_margin between 11 and 15 then '15'
          when predicted_margin >= 16 then '20+'
          else null
        end as bucket
      from public.user_predictions
      where match_id = p_match_id
    ) t
    where t.bucket is not null
    group by t.side, t.bucket
  ) x;

  if uid is not null then
    select predicted_winner, predicted_margin
    into uw, um
    from public.user_predictions
    where match_id = p_match_id and user_id = uid and is_locked = true
    limit 1;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'scoring_mode', v_scoring_mode,
    'match_id', p_match_id,
    'home_team', gm.home_team,
    'away_team', gm.away_team,
    'kickoff_time', gm.kickoff_time,
    'status', gm.status,
    'home_score', v_home_score,
    'away_score', v_away_score,
    'actual_winner', v_actual_winner,
    'actual_margin', v_actual_margin,
    'total_predictions', total_c,
    'home_prediction_count', home_c,
    'away_prediction_count', away_c,
    'home_prediction_pct', home_pct,
    'away_prediction_pct', away_pct,
    'bucket_rows', bucket_rows,
    'community_average_label', community_avg_label,
    'user_locked_winner', uw,
    'user_locked_margin', um
  );
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
  count(*) filter (where ups.total_points = 4)::bigint as exact_score_count,
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
