-- Per-match prediction_cutoff_time column and legacy RLS (superseded by 014: predictions close at kickoff_time).

alter table public.game_matches add column if not exists prediction_cutoff_time timestamptz;

comment on column public.game_matches.prediction_cutoff_time is 'After this instant (inclusive), predictions are closed; null means no extra cutoff beyond status.';

-- Backfill upcoming/locked: same calendar day as kickoff at 13:00 in Africa/Johannesburg (app school-rugby context).
update public.game_matches gm
set prediction_cutoff_time = (
  (date_trunc('day', gm.kickoff_time at time zone 'Africa/Johannesburg') + interval '13 hours')
  at time zone 'Africa/Johannesburg'
)
where gm.prediction_cutoff_time is null
  and gm.status in ('upcoming', 'locked');

-- Replace prediction write policies to require open cutoff window
drop policy if exists "user_predictions_insert_own_upcoming" on public.user_predictions;
drop policy if exists "user_predictions_update_own_upcoming" on public.user_predictions;

create policy "user_predictions_insert_own_upcoming"
on public.user_predictions for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.game_matches g
    where g.id = match_id
      and g.status = 'upcoming'
      and (g.prediction_cutoff_time is null or g.prediction_cutoff_time > now())
  )
);

create policy "user_predictions_update_own_upcoming"
on public.user_predictions for update
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.game_matches g
    where g.id = user_predictions.match_id
      and g.status = 'upcoming'
      and (g.prediction_cutoff_time is null or g.prediction_cutoff_time > now())
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.game_matches g
    where g.id = match_id
      and g.status = 'upcoming'
      and (g.prediction_cutoff_time is null or g.prediction_cutoff_time > now())
  )
);
