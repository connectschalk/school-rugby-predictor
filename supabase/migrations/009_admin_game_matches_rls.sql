-- Allow Predict a Score fixture management for the admin account only (JWT email claim).

create policy "game_matches_insert_admin_email"
on public.game_matches for insert
to authenticated
with check ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');

create policy "game_matches_update_admin_email"
on public.game_matches for update
to authenticated
using ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com')
with check ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');

create policy "game_matches_delete_admin_email"
on public.game_matches for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');
