-- Public prediction game (separate from existing `matches` / predictor tables)

create table if not exists public.game_matches (
  id uuid primary key default gen_random_uuid(),
  home_team text not null,
  away_team text not null,
  kickoff_time timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'locked', 'completed')),
  home_score integer,
  away_score integer,
  created_at timestamptz not null default now()
);

create index if not exists game_matches_status_kickoff_idx on public.game_matches (status, kickoff_time);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.game_matches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  predicted_winner text not null check (predicted_winner in ('home', 'away')),
  predicted_margin integer not null check (predicted_margin > 0),
  submitted_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists user_predictions_match_id_idx on public.user_predictions (match_id);
create index if not exists user_predictions_user_id_idx on public.user_predictions (user_id);

alter table public.game_matches enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_predictions enable row level security;

-- Anyone can read fixtures (landing list before sign-in)
create policy "game_matches_select_public"
on public.game_matches for select
to anon, authenticated
using (true);

-- Profiles: own row only
create policy "user_profiles_select_own"
on public.user_profiles for select
to authenticated
using (auth.uid() = id);

create policy "user_profiles_insert_own"
on public.user_profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "user_profiles_update_own"
on public.user_profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Predictions: own rows; writes only while match is still upcoming
create policy "user_predictions_select_own"
on public.user_predictions for select
to authenticated
using (auth.uid() = user_id);

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
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.game_matches g
    where g.id = match_id
      and g.status = 'upcoming'
  )
);
