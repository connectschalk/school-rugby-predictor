-- Fix away-winner branch typo in community stats RPC.

create or replace function public.get_community_prediction_stats(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  gm public.game_matches%rowtype;
  v_user uuid := auth.uid();
  total_c integer := 0;
  home_c integer := 0;
  away_c integer := 0;
  home_name text;
  away_name text;
  my_winner text;
  my_margin integer;
  bucket_rows jsonb;
  v_signed_avg numeric;
  community_avg_label text;
  home_pct numeric;
  away_pct numeric;
  v_home_score integer;
  v_away_score integer;
  v_actual_winner text;
  v_actual_margin integer;
begin
  select * into gm from public.game_matches where id = p_match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'match_not_found');
  end if;

  home_name := gm.home_team;
  away_name := gm.away_team;

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
  else
    v_actual_winner := null;
    v_actual_margin := null;
  end if;

  select
    count(*)::integer,
    count(*) filter (where predicted_winner = 'home')::integer,
    count(*) filter (where predicted_winner = 'away')::integer
  into total_c, home_c, away_c
  from public.user_predictions
  where match_id = p_match_id;

  select avg(
    case
      when predicted_winner = 'home' then -predicted_margin::numeric
      else predicted_margin::numeric
    end
  ) into v_signed_avg
  from public.user_predictions
  where match_id = p_match_id;

  community_avg_label :=
    case
      when v_signed_avg is null then null
      when round(v_signed_avg) = 0 then 'Draw / even'
      when round(v_signed_avg) < 0 then home_name || ' by ' || abs(round(v_signed_avg))::text
      else away_name || ' by ' || abs(round(v_signed_avg))::text
    end;

  if total_c > 0 then
    home_pct := round((home_c::numeric / total_c::numeric) * 100, 1);
    away_pct := round((away_c::numeric / total_c::numeric) * 100, 1);
  else
    home_pct := 0;
    away_pct := 0;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'side', x.side,
        'bucket', x.bucket,
        'percentage', round((x.cnt::numeric / nullif(total_c, 0)) * 100, 1),
        'team_name', case x.side when 'home' then home_name else away_name end
      )
      order by
        case x.side when 'home' then 0 else 1 end,
        case x.bucket
          when '20+' then 0
          when '15' then 1
          when '10' then 2
          when '5' then 3
          else 4
        end
    ),
    '[]'::jsonb
  ) into bucket_rows
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

  if v_user is not null then
    select up.predicted_winner, up.predicted_margin
      into my_winner, my_margin
    from public.user_predictions up
    where up.match_id = p_match_id
      and up.user_id = v_user
      and up.is_locked = true
    limit 1;
  else
    my_winner := null;
    my_margin := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'home_team', home_name,
    'away_team', away_name,
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
    'user_locked_winner', my_winner,
    'user_locked_margin', my_margin
  );
end;
$$;
