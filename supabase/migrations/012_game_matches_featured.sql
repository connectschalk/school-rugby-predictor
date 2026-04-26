-- Featured fixtures for Predict a Score (ordering + admin cap enforced in app).

alter table public.game_matches add column if not exists is_featured boolean not null default false;
alter table public.game_matches add column if not exists featured_order integer;

comment on column public.game_matches.is_featured is 'When true, match is highlighted and ordered with other featured games.';
comment on column public.game_matches.featured_order is 'Display order among featured games (1–10); null when not featured.';
