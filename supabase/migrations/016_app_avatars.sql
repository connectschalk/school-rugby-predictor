-- Approved avatars for signup/profile (paths under /public, e.g. /avatars/avatar-1.png).

create table if not exists public.app_avatars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists app_avatars_active_sort_idx
  on public.app_avatars (is_active, sort_order, name);

alter table public.app_avatars enable row level security;

-- Public read: active avatars only (signup before login uses anon).
create policy "app_avatars_select_active_public"
on public.app_avatars for select
to anon, authenticated
using (is_active = true);

-- Same admin gate as game_matches (JWT email claim).
create policy "app_avatars_insert_admin_email"
on public.app_avatars for insert
to authenticated
with check ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');

create policy "app_avatars_update_admin_email"
on public.app_avatars for update
to authenticated
using ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com')
with check ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');

create policy "app_avatars_delete_admin_email"
on public.app_avatars for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'connect.schalk@gmail.com');

comment on table public.app_avatars is 'Curated avatars; image_url is public path (e.g. /avatars/avatar-1.png).';

-- Seed examples (run in the SQL editor after adding image files to Next.js `public/avatars/`):
-- insert into public.app_avatars (name, image_url, sort_order, is_active) values
--   ('Character 1', '/avatars/avatar-1.png', 1, true),
--   ('Character 2', '/avatars/avatar-2.png', 2, true);
