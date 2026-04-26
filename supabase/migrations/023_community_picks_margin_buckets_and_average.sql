-- Community picks: fixed margin buckets, percentage bar heights, signed community average.

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
  bucket_rows jsonb;
  v_signed_avg numeric;
  community_avg_label text;
  home_pct numeric;
  away_pct numeric;
begin
  uw := null;
  um := null;
  bucket_rows := '[]'::jsonb;
  community_avg_label := null;
  v_signed_avg := null;

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
    'match_id', p_match_id,
    'home_team', gm.home_team,
    'away_team', gm.away_team,
    'kickoff_time', gm.kickoff_time,
    'status', gm.status,
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

comment on function public.get_community_prediction_stats(uuid) is
  'Bucketed margin distribution (percent of all picks), signed community average, kickoff gate unchanged.';
