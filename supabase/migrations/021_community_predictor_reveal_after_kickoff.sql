-- Patch for databases that already applied an older 020: public community stats use kickoff_time
-- only (not game_matches.status). Safe to run on fresh DBs too (redefines same function body).

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
  reveal_all boolean;
  user_locked boolean := false;
  total_c integer;
  home_c integer;
  away_c integer;
  h1 integer; h2 integer; h3 integer; h4 integer; h5 integer;
  a1 integer; a2 integer; a3 integer; a4 integer; a5 integer;
  uw text;
  um integer;
  best_key text;
  best_n integer;
  j jsonb;
begin
  uw := null;
  um := null;
  select * into gm from public.game_matches where id = p_match_id;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'match_not_found');
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

  select
    count(*)::integer,
    count(*) filter (where predicted_winner = 'home')::integer,
    count(*) filter (where predicted_winner = 'away')::integer,
    coalesce(sum(case when predicted_winner = 'home' and predicted_margin between 1 and 5 then 1 else 0 end), 0)::integer,
    coalesce(sum(case when predicted_winner = 'home' and predicted_margin between 6 and 10 then 1 else 0 end), 0)::integer,
    coalesce(sum(case when predicted_winner = 'home' and predicted_margin between 11 and 15 then 1 else 0 end), 0)::integer,
    coalesce(sum(case when predicted_winner = 'home' and predicted_margin between 16 and 20 then 1 else 0 end), 0)::integer,
    coalesce(sum(case when predicted_winner = 'home' and predicted_margin >= 21 then 1 else 0 end), 0)::integer,
    coalesce(sum(case when predicted_winner = 'away' and predicted_margin between 1 and 5 then 1 else 0 end), 0)::integer,
    coalesce(sum(case when predicted_winner = 'away' and predicted_margin between 6 and 10 then 1 else 0 end), 0)::integer,
    coalesce(sum(case when predicted_winner = 'away' and predicted_margin between 11 and 15 then 1 else 0 end), 0)::integer,
    coalesce(sum(case when predicted_winner = 'away' and predicted_margin between 16 and 20 then 1 else 0 end), 0)::integer,
    coalesce(sum(case when predicted_winner = 'away' and predicted_margin >= 21 then 1 else 0 end), 0)::integer
  into total_c, home_c, away_c, h1, h2, h3, h4, h5, a1, a2, a3, a4, a5
  from public.user_predictions
  where match_id = p_match_id;

  if total_c is null then
    total_c := 0;
    home_c := 0;
    away_c := 0;
    h1 := 0; h2 := 0; h3 := 0; h4 := 0; h5 := 0;
    a1 := 0; a2 := 0; a3 := 0; a4 := 0; a5 := 0;
  end if;

  if uid is not null then
    select predicted_winner, predicted_margin
    into uw, um
    from public.user_predictions
    where match_id = p_match_id and user_id = uid and is_locked = true
    limit 1;
  end if;

  j := jsonb_build_array(
    jsonb_build_object('margin_bucket', 'home_21+', 'predicted_winner', 'home', 'prediction_count', h5),
    jsonb_build_object('margin_bucket', 'home_16_20', 'predicted_winner', 'home', 'prediction_count', h4),
    jsonb_build_object('margin_bucket', 'home_11_15', 'predicted_winner', 'home', 'prediction_count', h3),
    jsonb_build_object('margin_bucket', 'home_6_10', 'predicted_winner', 'home', 'prediction_count', h2),
    jsonb_build_object('margin_bucket', 'home_1_5', 'predicted_winner', 'home', 'prediction_count', h1),
    jsonb_build_object('margin_bucket', 'away_1_5', 'predicted_winner', 'away', 'prediction_count', a1),
    jsonb_build_object('margin_bucket', 'away_6_10', 'predicted_winner', 'away', 'prediction_count', a2),
    jsonb_build_object('margin_bucket', 'away_11_15', 'predicted_winner', 'away', 'prediction_count', a3),
    jsonb_build_object('margin_bucket', 'away_16_20', 'predicted_winner', 'away', 'prediction_count', a4),
    jsonb_build_object('margin_bucket', 'away_21+', 'predicted_winner', 'away', 'prediction_count', a5)
  );

  best_key := null;
  best_n := -1;
  if h5 > best_n then best_n := h5; best_key := 'home_21+'; end if;
  if h4 > best_n then best_n := h4; best_key := 'home_16_20'; end if;
  if h3 > best_n then best_n := h3; best_key := 'home_11_15'; end if;
  if h2 > best_n then best_n := h2; best_key := 'home_6_10'; end if;
  if h1 > best_n then best_n := h1; best_key := 'home_1_5'; end if;
  if a1 > best_n then best_n := a1; best_key := 'away_1_5'; end if;
  if a2 > best_n then best_n := a2; best_key := 'away_6_10'; end if;
  if a3 > best_n then best_n := a3; best_key := 'away_11_15'; end if;
  if a4 > best_n then best_n := a4; best_key := 'away_16_20'; end if;
  if a5 > best_n then best_n := a5; best_key := 'away_21+'; end if;

  if best_n <= 0 then
    best_key := null;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'match_id', p_match_id,
    'home_team', gm.home_team,
    'away_team', gm.away_team,
    'kickoff_time', gm.kickoff_time,
    'status', gm.status,
    'total_predictions', total_c,
    'home_prediction_count', home_c,
    'away_prediction_count', away_c,
    'buckets', j,
    'most_common_bucket', best_key,
    'user_locked_winner', uw,
    'user_locked_margin', um
  );
end;
$$;

comment on function public.get_community_prediction_stats(uuid) is
  'Community aggregates for a match. kickoff_time > now(): require auth.uid() is_locked row. kickoff_time <= now(): public (anon allowed). Aggregates only.';
