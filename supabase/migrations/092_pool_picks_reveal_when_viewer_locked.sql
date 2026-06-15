-- Pool picks: reveal member predictions when kickoff/cutoff passes OR the viewer has locked their pick.
-- Before that gate, return member rows but hide prediction values (reveal_allowed = false).

drop function if exists public.pool_match_predictions_for_viewer(uuid, uuid);

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
  predicted_home_score integer,
  predicted_away_score integer,
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
  ),
  reveal as (
    select
      ctx.picks_gate_passed
        or coalesce((select vp.is_locked from viewer_pred vp), false) as viewer_can_see
    from ctx
  )
  select
    pm.user_id,
    coalesce(nullif(trim(upf.display_name), ''), 'Player') as display_name,
    upf.avatar_url,
    upf.avatar_letter,
    upf.avatar_colour,
    (pm.user_id = ctx.viewer_id) as is_viewer,
    reveal.viewer_can_see as reveal_allowed,
    case when reveal.viewer_can_see then upp.predicted_winner else null end as predicted_winner,
    case when reveal.viewer_can_see then upp.predicted_margin::integer else null end as predicted_margin,
    case when reveal.viewer_can_see then upp.predicted_home_score else null end as predicted_home_score,
    case when reveal.viewer_can_see then upp.predicted_away_score else null end as predicted_away_score,
    coalesce(upp.is_locked, false) as is_locked,
    case when reveal.viewer_can_see then upp.locked_at else null end as locked_at,
    case when reveal.viewer_can_see then upp.submitted_at else null end as submitted_at,
    case when reveal.viewer_can_see then ups.total_points else null end::numeric as score_total_points,
    case when reveal.viewer_can_see then ups.margin_difference else null end::bigint as score_margin_difference
  from public.pool_members pm
  join ctx on true
  cross join reveal
  left join public.user_profiles upf on upf.id = pm.user_id
  left join public.user_predictions upp on upp.user_id = pm.user_id and upp.match_id = p_match_id
  left join public.user_prediction_scores ups
    on ups.user_id = pm.user_id and ups.match_id = p_match_id
  where pm.pool_id = p_pool_id
    and public.is_pool_member(p_pool_id, ctx.viewer_id);
$$;

revoke all on function public.pool_match_predictions_for_viewer(uuid, uuid) from public;
grant execute on function public.pool_match_predictions_for_viewer(uuid, uuid) to authenticated;
