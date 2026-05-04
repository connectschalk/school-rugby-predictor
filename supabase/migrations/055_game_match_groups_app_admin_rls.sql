-- Allow any app admin (user_profiles.role = 'admin') to maintain game_match_groups,
-- in addition to the legacy hard-coded admin email policies from 031.
-- Fixes sheet sync when JWT email is not connect.schalk@gmail.com.

drop policy if exists game_match_groups_insert_app_admin on public.game_match_groups;
create policy game_match_groups_insert_app_admin
on public.game_match_groups for insert
to authenticated
with check (public.is_app_admin(auth.uid()));

drop policy if exists game_match_groups_update_app_admin on public.game_match_groups;
create policy game_match_groups_update_app_admin
on public.game_match_groups for update
to authenticated
using (public.is_app_admin(auth.uid()))
with check (public.is_app_admin(auth.uid()));

drop policy if exists game_match_groups_delete_app_admin on public.game_match_groups;
create policy game_match_groups_delete_app_admin
on public.game_match_groups for delete
to authenticated
using (public.is_app_admin(auth.uid()));
