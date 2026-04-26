-- Predictions close at kickoff_time. Column prediction_cutoff_time is unused; kept for backward compatibility.

comment on column public.game_matches.prediction_cutoff_time is
  'Unused: predictions close at kickoff_time. Safe to drop in a future migration after confirming no external dependencies.';

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
      and g.kickoff_time > now()
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
      and g.kickoff_time > now()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.game_matches g
    where g.id = match_id
      and g.status = 'upcoming'
      and g.kickoff_time > now()
  )
);
