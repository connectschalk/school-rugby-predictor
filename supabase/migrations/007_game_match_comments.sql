-- Match banter: public.game_match_comments (safe if an earlier migration did not run or failed)
-- No updates policy — inserts and deletes only.

create table if not exists public.game_match_comments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.game_matches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists game_match_comments_match_id_idx on public.game_match_comments (match_id);

create index if not exists game_match_comments_user_id_idx on public.game_match_comments (user_id);

create index if not exists game_match_comments_created_at_idx on public.game_match_comments (created_at);

alter table public.game_match_comments enable row level security;

-- Replace policies so we never grant UPDATE (removes legacy update policy if present)
drop policy if exists "game_match_comments_select_public" on public.game_match_comments;
drop policy if exists "game_match_comments_insert_own" on public.game_match_comments;
drop policy if exists "game_match_comments_update_own" on public.game_match_comments;
drop policy if exists "game_match_comments_delete_own" on public.game_match_comments;

create policy "game_match_comments_select_public"
on public.game_match_comments for select
to anon, authenticated
using (true);

create policy "game_match_comments_insert_own"
on public.game_match_comments for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (select 1 from public.game_matches g where g.id = match_id)
);

create policy "game_match_comments_delete_own"
on public.game_match_comments for delete
to authenticated
using (auth.uid() = user_id);
