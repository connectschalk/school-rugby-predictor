-- Admin may insert/update user_predictions after kickoff (normal users remain gated by kickoff_time > now()).

create or replace function public.user_predictions_reject_update_when_locked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_locked and not public.is_app_admin(auth.uid()) then
    raise exception 'LOCKED_PREDICTION_IMMUTABLE' using errcode = '23514';
  end if;
  if new.is_locked and not old.is_locked and not public.is_app_admin(auth.uid()) then
    if new.predicted_winner is distinct from old.predicted_winner
       or new.predicted_margin is distinct from old.predicted_margin
       or new.predicted_home_score is distinct from old.predicted_home_score
       or new.predicted_away_score is distinct from old.predicted_away_score then
      raise exception 'LOCK_SET_MUST_NOT_CHANGE_PICK' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_predictions'
      and policyname = 'user_predictions_insert_admin'
  ) then
    create policy "user_predictions_insert_admin"
    on public.user_predictions for insert
    to authenticated
    with check (public.is_app_admin(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_predictions'
      and policyname = 'user_predictions_update_admin'
  ) then
    create policy "user_predictions_update_admin"
    on public.user_predictions for update
    to authenticated
    using (public.is_app_admin(auth.uid()))
    with check (public.is_app_admin(auth.uid()));
  end if;
end;
$$;
