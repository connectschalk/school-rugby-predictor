-- Pool leaderboard: extra aggregate columns for pool detail UI.
-- Pool match predictions: reveal after cutoff/kickoff/status; expose submitted_at and score columns for picks table.

create or replace function public.pool_leaderboard(
  p_pool_id uuid,
  p_week_start date default null
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  avatar_letter text,
  avatar_colour text,
  joined_at timestamptz,
  total_points numeric,
  total_margin_difference bigint,
  average_margin_difference numeric,
  games_predicted bigint,
  correct_winners bigint,
  margin_points_total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with em as (
    select match_id from public.pool_effective_matches(p_pool_id, p_week_start)
  )
  select
    pm.user_id,
    coalesce(nullif(trim(up.display_name), ''), 'Player') as display_name,
    up.avatar_url,
    up.avatar_letter,
    up.avatar_colour,
    pm.joined_at,
    coalesce(sum(ups.total_points), 0)::numeric as total_points,
    coalesce(sum(ups.margin_difference), 0)::bigint as total_margin_difference,
    coalesce(avg(ups.margin_difference::numeric), null) as average_margin_difference,
    coalesce(count(ups.prediction_id), 0)::bigint as games_predicted,
    coalesce(sum(case when ups.winner_correct then 1 else 0 end), 0)::bigint as correct_winners,
    coalesce(sum(ups.margin_points), 0)::numeric as margin_points_total
  from public.pool_members pm
  left join public.user_profiles up on up.id = pm.user_id
  left join public.user_prediction_scores ups
    on ups.user_id = pm.user_id
   and ups.match_id in (select match_id from em)
   and ups.scored_at >= pm.joined_at
  where pm.pool_id = p_pool_id
  group by pm.user_id, up.display_name, up.avatar_url, up.avatar_letter, up.avatar_colour, pm.joined_at;
$$;

create or replace function public.pool_match_predictions_for_viewer(
  p_pool_id uuid,
  p_match_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  avatar_letter text,
  avatar_colour text,
  is_viewer boolean,
  reveal_allowed boolean,
  predicted_winner text,
  predicted_margin integer,
  is_locked boolean,
  locked_at timestamptz,
  submitted_at timestamptz,
  score_total_points numeric,
  score_margin_difference bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ctx as (
    select
      auth.uid() as viewer_id,
      gm.kickoff_time,
      gm.prediction_cutoff_time,
      gm.status::text as match_status,
      (
        gm.status in ('locked', 'completed')
        or (gm.prediction_cutoff_time is not null and now() >= gm.prediction_cutoff_time)
        or (gm.prediction_cutoff_time is null and now() >= gm.kickoff_time)
      ) as picks_gate_passed
    from public.game_matches gm
    where gm.id = p_match_id
  ),
  viewer_pred as (
    select up.is_locked
    from public.user_predictions up
    join ctx on true
    where up.match_id = p_match_id
      and up.user_id = ctx.viewer_id
    limit 1
  )
  select
    pm.user_id,
    coalesce(nullif(trim(upf.display_name), ''), 'Player') as display_name,
    upf.avatar_url,
    upf.avatar_letter,
    upf.avatar_colour,
    (pm.user_id = ctx.viewer_id) as is_viewer,
    (
      (pm.user_id = ctx.viewer_id)
      or ctx.picks_gate_passed
      or coalesce((select vp.is_locked from viewer_pred vp), false)
    ) as reveal_allowed,
    case
      when (pm.user_id = ctx.viewer_id)
        or ctx.picks_gate_passed
        or coalesce((select vp.is_locked from viewer_pred vp), false)
      then upp.predicted_winner
      else null
    end as predicted_winner,
    case
      when (pm.user_id = ctx.viewer_id)
        or ctx.picks_gate_passed
        or coalesce((select vp.is_locked from viewer_pred vp), false)
      then upp.predicted_margin
      else null
    end as predicted_margin,
    upp.is_locked,
    upp.locked_at,
    case
      when (pm.user_id = ctx.viewer_id)
        or ctx.picks_gate_passed
        or coalesce((select vp.is_locked from viewer_pred vp), false)
      then upp.submitted_at
      else null
    end as submitted_at,
    case
      when (pm.user_id = ctx.viewer_id)
        or ctx.picks_gate_passed
        or coalesce((select vp.is_locked from viewer_pred vp), false)
      then ups.total_points
      else null
    end::numeric as score_total_points,
    case
      when (pm.user_id = ctx.viewer_id)
        or ctx.picks_gate_passed
        or coalesce((select vp.is_locked from viewer_pred vp), false)
      then ups.margin_difference
      else null
    end::bigint as score_margin_difference
  from public.pool_members pm
  join ctx on true
  left join public.user_profiles upf on upf.id = pm.user_id
  left join public.user_predictions upp on upp.user_id = pm.user_id and upp.match_id = p_match_id
  left join public.user_prediction_scores ups
    on ups.user_id = pm.user_id and ups.match_id = p_match_id
  where pm.pool_id = p_pool_id
    and public.is_pool_member(p_pool_id, ctx.viewer_id);
$$;

revoke all on function public.pool_leaderboard(uuid, date) from public;
revoke all on function public.pool_match_predictions_for_viewer(uuid, uuid) from public;

grant execute on function public.pool_leaderboard(uuid, date) to authenticated;
grant execute on function public.pool_match_predictions_for_viewer(uuid, uuid) to authenticated;
