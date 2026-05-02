-- Allow app admins to read all user_predictions (for scoring diagnostics & bulk score).
-- Existing "user_predictions_select_own" still applies; policies are combined with OR.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_predictions'
      and policyname = 'user_predictions_select_admin'
  ) then
    create policy "user_predictions_select_admin"
    on public.user_predictions for select
    to authenticated
    using (public.is_app_admin(auth.uid()));
  end if;
end $$;
