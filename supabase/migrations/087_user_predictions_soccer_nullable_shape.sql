-- Soccer exact-score saves require predicted_winner / predicted_margin to be null.
-- Safe to re-run if 084 was skipped or only partially applied on a deployed database.

alter table public.user_predictions
  add column if not exists predicted_home_score integer,
  add column if not exists predicted_away_score integer;

alter table public.user_predictions
  alter column predicted_winner drop not null,
  alter column predicted_margin drop not null;

alter table public.user_predictions
  drop constraint if exists user_predictions_predicted_winner_check;

alter table public.user_predictions
  add constraint user_predictions_predicted_winner_check
  check (predicted_winner is null or predicted_winner in ('home', 'away', 'draw'));

alter table public.user_predictions
  drop constraint if exists user_predictions_predicted_margin_check;

alter table public.user_predictions
  add constraint user_predictions_predicted_margin_check
  check (predicted_margin is null or predicted_margin > 0);

alter table public.user_predictions
  drop constraint if exists user_predictions_predicted_home_score_check;

alter table public.user_predictions
  add constraint user_predictions_predicted_home_score_check
  check (predicted_home_score is null or (predicted_home_score >= 0 and predicted_home_score <= 20));

alter table public.user_predictions
  drop constraint if exists user_predictions_predicted_away_score_check;

alter table public.user_predictions
  add constraint user_predictions_predicted_away_score_check
  check (predicted_away_score is null or (predicted_away_score >= 0 and predicted_away_score <= 20));

alter table public.user_predictions
  drop constraint if exists user_predictions_shape_check;

alter table public.user_predictions
  add constraint user_predictions_shape_check
  check (
    (
      predicted_home_score is not null
      and predicted_away_score is not null
      and predicted_winner is null
      and predicted_margin is null
    )
    or (
      predicted_winner is not null
      and predicted_margin is not null
      and predicted_home_score is null
      and predicted_away_score is null
    )
  );

comment on column public.user_predictions.predicted_home_score is
  'Soccer exact-score mode: predicted home goals (0–20, normal time).';
comment on column public.user_predictions.predicted_away_score is
  'Soccer exact-score mode: predicted away goals (0–20, normal time).';
