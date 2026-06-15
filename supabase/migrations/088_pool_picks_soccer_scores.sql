-- Pool picks: return soccer exact-score columns for community aggregation in the app.

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
  )
  select
    pm.user_id,
    coalesce(nullif(trim(upf.display_name), ''), 'Player') as display_name,
    upf.avatar_url,
    upf.avatar_letter,
    upf.avatar_colour,
    (pm.user_id = ctx.viewer_id) as is_viewer,
    true as reveal_allowed,
    upp.predicted_winner,
    upp.predicted_margin::integer as predicted_margin,
    upp.predicted_home_score,
    upp.predicted_away_score,
    coalesce(upp.is_locked, false) as is_locked,
    upp.locked_at,
    upp.submitted_at,
    ups.total_points::numeric as score_total_points,
    ups.margin_difference::bigint as score_margin_difference
  from public.pool_members pm
  join ctx on true
  left join public.user_profiles upf on upf.id = pm.user_id
  left join public.user_predictions upp on upp.user_id = pm.user_id and upp.match_id = p_match_id
  left join public.user_prediction_scores ups
    on ups.user_id = pm.user_id and ups.match_id = p_match_id
  where pm.pool_id = p_pool_id
    and public.is_pool_member(p_pool_id, ctx.viewer_id)
    and ctx.picks_gate_passed;
$$;

revoke all on function public.pool_match_predictions_for_viewer(uuid, uuid) from public;
grant execute on function public.pool_match_predictions_for_viewer(uuid, uuid) to authenticated;
