-- Community picks RPC: schema guards + slug-safe scoring_mode (works before/after 084).
-- After applying: Supabase Dashboard → Settings → API → Reload schema cache (or restart API).

alter table public.competitions
  add column if not exists scoring_mode text not null default 'rugby_margin';

do $$
begin
  alter table public.competitions
    add constraint competitions_scoring_mode_check
    check (scoring_mode in ('rugby_margin', 'soccer_exact_score'));
exception
  when duplicate_object then null;
end $$;

update public.competitions
set scoring_mode = 'soccer_exact_score'
where slug = 'soccer-world-cup'
  and scoring_mode is distinct from 'soccer_exact_score';

alter table public.user_predictions
  add column if not exists predicted_home_score integer,
  add column if not exists predicted_away_score integer;

alter table public.user_predictions
  alter column predicted_winner drop not null,
  alter column predicted_margin drop not null;

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
  home_pct := 0;
  away_pct := 0;
  draw_pct := 0;

  select
    gm_inner.*,
    case
      when lower(trim(coalesce(c.slug, ''))) = 'soccer-world-cup' then 'soccer_exact_score'
      when coalesce(c.scoring_mode, 'rugby_margin') = 'soccer_exact_score' then 'soccer_exact_score'
      else 'rugby_margin'
    end as scoring_mode
  into gm
  from public.game_matches gm_inner
  left join public.competitions c on c.id = gm_inner.competition_id
  where gm_inner.id = p_match_id;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'match_not_found');
  end if;

  v_scoring_mode := coalesce(nullif(trim(gm.scoring_mode), ''), 'rugby_margin');
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

  reveal_all := (gm.kickoff_time <= now())
    or lower(trim(coalesce(gm.status, ''))) = 'completed';

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
      limit 5
    ) x;

    select
      count(*) filter (where predicted_home_score > predicted_away_score)::integer,
      count(*) filter (where predicted_away_score > predicted_home_score)::integer,
      count(*) filter (where predicted_home_score = predicted_away_score)::integer
    into home_c, away_c, draw_c
    from public.user_predictions
    where match_id = p_match_id
      and predicted_home_score is not null
      and predicted_away_score is not null;

    if total_c > 0 then
      home_pct := round(100.0 * home_c::numeric / total_c::numeric, 1);
      away_pct := round(100.0 * away_c::numeric / total_c::numeric, 1);
      draw_pct := round(100.0 * draw_c::numeric / total_c::numeric, 1);
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
      community_avg_label :=
        trim(to_char(round(v_avg_home, 1), 'FM9990.0'))
        || ' - '
        || trim(to_char(round(v_avg_away, 1), 'FM9990.0'));
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
      'home_prediction_count', coalesce(home_c, 0),
      'away_prediction_count', coalesce(away_c, 0),
      'draw_prediction_count', coalesce(draw_c, 0),
      'home_prediction_pct', home_pct,
      'away_prediction_pct', away_pct,
      'draw_prediction_pct', draw_pct,
      'top_scorelines', top_scorelines,
      'community_average_label', community_avg_label,
      'user_locked_home_score', uh,
      'user_locked_away_score', ua
    );
  end if;

  -- Rugby margin: winner + margin only (never soccer score columns).
  select
    count(*)::integer,
    count(*) filter (where predicted_winner = 'home')::integer,
    count(*) filter (where predicted_winner = 'away')::integer
  into total_c, home_c, away_c
  from public.user_predictions
  where match_id = p_match_id
    and predicted_winner in ('home', 'away')
    and predicted_margin is not null;

  total_c := coalesce(total_c, 0);
  home_c := coalesce(home_c, 0);
  away_c := coalesce(away_c, 0);

  if total_c > 0 then
    home_pct := round(100.0 * home_c::numeric / total_c::numeric, 1);
    away_pct := round(100.0 * away_c::numeric / total_c::numeric, 1);
  end if;

  select avg(
    case
      when predicted_winner = 'home' then -predicted_margin::numeric
      else predicted_margin::numeric
    end
  )
  into v_signed_avg
  from public.user_predictions
  where match_id = p_match_id
    and predicted_winner in ('home', 'away')
    and predicted_margin is not null;

  if total_c = 0 or v_signed_avg is null then
    community_avg_label := null;
  elsif round(v_signed_avg) = 0 then
    community_avg_label := 'Draw / even';
  elsif v_signed_avg < 0 then
    community_avg_label := gm.home_team || ' by ' || round(abs(v_signed_avg))::text;
  else
    community_avg_label := gm.away_team || ' by ' || round(v_signed_avg)::text;
  end if;

  if total_c > 0 then
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
          and predicted_winner in ('home', 'away')
          and predicted_margin is not null
      ) t
      where t.bucket is not null
      group by t.side, t.bucket
    ) x;
  else
    bucket_rows := '[]'::jsonb;
  end if;

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
    'scoring_mode', 'rugby_margin',
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

comment on function public.get_community_prediction_stats(uuid) is
  'Community picks stats. Defaults to rugby_margin. Soccer uses exact scores. Zero predictions returns allowed:true with empty aggregates.';

revoke all on function public.get_community_prediction_stats(uuid) from public;
grant execute on function public.get_community_prediction_stats(uuid) to anon;
grant execute on function public.get_community_prediction_stats(uuid) to authenticated;
grant execute on function public.get_community_prediction_stats(uuid) to service_role;
