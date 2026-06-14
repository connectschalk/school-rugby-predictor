-- Admin competition import: stable external fixture ids per competition.

alter table public.game_matches
  add column if not exists external_id text,
  add column if not exists fixture_round text;

create unique index if not exists game_matches_competition_external_id_uidx
  on public.game_matches (competition_id, external_id)
  where external_id is not null and btrim(external_id) <> '';

create index if not exists game_matches_competition_kickoff_teams_idx
  on public.game_matches (competition_id, kickoff_time, home_team, away_team);
