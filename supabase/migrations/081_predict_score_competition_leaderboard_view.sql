-- Repair / ensure competition-scoped leaderboard view exists (originally added in 077).
-- Safe to re-run: create or replace view.

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

grant select on public.predict_score_competition_leaderboard to anon, authenticated;
