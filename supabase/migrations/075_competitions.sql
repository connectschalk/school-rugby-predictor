-- Phase 1: competitions shell; backfill existing Schools data.

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  logo_url text,
  hero_image_url text,
  sport_type text not null,
  competition_mode text not null
    check (competition_mode in ('custom_pool_fixtures', 'official_fixed_fixtures')),
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists competitions_slug_idx on public.competitions (slug);
create index if not exists competitions_active_order_idx
  on public.competitions (is_active, display_order);

alter table public.pools
  add column if not exists competition_id uuid references public.competitions (id) on delete restrict;

alter table public.game_matches
  add column if not exists competition_id uuid references public.competitions (id) on delete restrict;

create index if not exists pools_competition_id_idx on public.pools (competition_id);
create index if not exists game_matches_competition_id_idx on public.game_matches (competition_id);

insert into public.competitions (
  slug,
  name,
  description,
  sport_type,
  competition_mode,
  is_active,
  display_order
)
values
  (
    'nextplay-schools',
    'NextPlay Schools',
    'Create your own school rugby prediction pool. Choose your teams, invite your people, and follow the rankings.',
    'rugby',
    'custom_pool_fixtures',
    true,
    1
  ),
  (
    'craven-week',
    'NextPlay Craven Week',
    'Create a pool for the official Craven Week fixtures. Invite your group and predict every match.',
    'rugby',
    'official_fixed_fixtures',
    true,
    2
  ),
  (
    'soccer-world-cup',
    'NextPlay Soccer World Cup',
    'Create your World Cup pool. Predict the official tournament fixtures and compete with your friends.',
    'soccer',
    'official_fixed_fixtures',
    true,
    3
  )
on conflict (slug) do nothing;

update public.pools p
set competition_id = c.id
from public.competitions c
where c.slug = 'nextplay-schools'
  and p.competition_id is null;

update public.game_matches gm
set competition_id = c.id
from public.competitions c
where c.slug = 'nextplay-schools'
  and gm.competition_id is null;

alter table public.competitions enable row level security;

drop policy if exists competitions_select_public on public.competitions;
create policy competitions_select_public
on public.competitions for select
to anon, authenticated
using (is_active = true);

grant select on public.competitions to anon, authenticated;
