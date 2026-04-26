-- Community picks: exact predicted_margin counts per side (no buckets, no scores).

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
  uw text;
  um integer;
  margin_rows jsonb;
  best_label text;
begin
  uw := null;
  um := null;
  margin_rows := '[]'::jsonb;
  best_label := null;

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
    count(*) filter (where predicted_winner = 'away')::integer
  into total_c, home_c, away_c
  from public.user_predictions
  where match_id = p_match_id;

  if total_c is null then
    total_c := 0;
    home_c := 0;
    away_c := 0;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'team_name',
        case agg.predicted_winner when 'home' then gm.home_team else gm.away_team end,
        'side',
        agg.predicted_winner,
        'predicted_margin',
        agg.predicted_margin,
        'count',
        agg.cnt
      )
      order by agg.predicted_winner desc, agg.predicted_margin desc
    ),
    '[]'::jsonb
  )
  into margin_rows
  from (
    select predicted_winner, predicted_margin, count(*)::integer as cnt
    from public.user_predictions
    where match_id = p_match_id
    group by predicted_winner, predicted_margin
  ) agg;

  select coalesce(
    (
      select tn || ' by ' || pm::text
      from (
        select
          case up.predicted_winner when 'home' then gm.home_team else gm.away_team end as tn,
          up.predicted_margin as pm,
          count(*)::integer as c
        from public.user_predictions up
        where up.match_id = p_match_id
        group by up.predicted_winner, up.predicted_margin, gm.home_team, gm.away_team
        order by c desc, pm desc, tn asc
        limit 1
      ) x
    ),
    null::text
  )
  into best_label;

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
    'match_id', p_match_id,
    'home_team', gm.home_team,
    'away_team', gm.away_team,
    'kickoff_time', gm.kickoff_time,
    'status', gm.status,
    'total_predictions', total_c,
    'home_prediction_count', home_c,
    'away_prediction_count', away_c,
    'margin_rows', margin_rows,
    'most_common_label', best_label,
    'user_locked_winner', uw,
    'user_locked_margin', um
  );
end;
$$;

comment on function public.get_community_prediction_stats(uuid) is
  'Exact-margin aggregates from user_predictions only. kickoff_time gate unchanged.';
