-- Allow admin fixture import flow to create/update fixture groups and links.
-- Mirrors existing admin policy style used for game_matches.

drop policy if exists fixture_groups_insert_admin_email on public.fixture_groups;
create policy fixture_groups_insert_admin_email
on public.fixture_groups for insert
to authenticated
with check ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');

drop policy if exists fixture_groups_update_admin_email on public.fixture_groups;
create policy fixture_groups_update_admin_email
on public.fixture_groups for update
to authenticated
using ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com')
with check ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');

drop policy if exists fixture_groups_delete_admin_email on public.fixture_groups;
create policy fixture_groups_delete_admin_email
on public.fixture_groups for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');

drop policy if exists game_match_groups_insert_admin_email on public.game_match_groups;
create policy game_match_groups_insert_admin_email
on public.game_match_groups for insert
to authenticated
with check ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');

drop policy if exists game_match_groups_update_admin_email on public.game_match_groups;
create policy game_match_groups_update_admin_email
on public.game_match_groups for update
to authenticated
using ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com')
with check ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');

drop policy if exists game_match_groups_delete_admin_email on public.game_match_groups;
create policy game_match_groups_delete_admin_email
on public.game_match_groups for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');
