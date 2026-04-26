-- Letter + colour avatars (no image DB). Keeps avatar_url for legacy rows.

alter table public.user_profiles
  add column if not exists avatar_letter text,
  add column if not exists avatar_colour text;

alter table public.user_profiles
  drop constraint if exists user_profiles_avatar_letter_check;

alter table public.user_profiles
  add constraint user_profiles_avatar_letter_check
  check (avatar_letter is null or avatar_letter ~ '^[A-Z]$');

alter table public.user_profiles
  drop constraint if exists user_profiles_avatar_colour_check;

alter table public.user_profiles
  add constraint user_profiles_avatar_colour_check
  check (
    avatar_colour is null
    or avatar_colour ~ '^#[0-9A-Fa-f]{6}$'
  );

comment on column public.user_profiles.avatar_letter is 'Single uppercase A–Z for generated circle avatar.';
comment on column public.user_profiles.avatar_colour is 'Background hex e.g. #111318; must match #RRGGBB.';

-- Season leaderboard view: same column order as migration 010, then profile extras (avoids PG rename errors on replace).
create or replace view public.predict_score_season_leaderboard as
select
  extract(year from gm.kickoff_time)::integer as season,
  ups.user_id,
  max(prof.display_name) as display_name,
  max(prof.avatar_url) as avatar_url,
  sum(ups.total_points)::bigint as total_points,
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
  sum(ups.margin_points)::bigint as margin_points_total,
  round(
    (sum(ups.margin_points)::numeric / nullif(count(*)::numeric, 0)),
    2
  ) as margin_points_average,
  max(prof.first_name) as first_name,
  max(prof.surname) as surname,
  max(prof.avatar_letter) as avatar_letter,
  max(prof.avatar_colour) as avatar_colour
from public.user_prediction_scores ups
join public.game_matches gm on gm.id = ups.match_id
left join public.user_profiles prof on prof.id = ups.user_id
where gm.status = 'completed'
group by extract(year from gm.kickoff_time)::integer, ups.user_id;
