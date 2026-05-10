-- Optional stable id from fixture sheet for sync matching (avoids duplicate rows when team labels differ).
alter table public.game_matches
  add column if not exists fixture_key text;

create index if not exists game_matches_fixture_key_idx
  on public.game_matches (fixture_key)
  where fixture_key is not null;
