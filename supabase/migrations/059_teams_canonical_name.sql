-- Official display name from Teams tab (sheet). Pool picker and fixtures prefer this over legacy `name` when set.
alter table public.teams add column if not exists canonical_name text;

comment on column public.teams.canonical_name is
  'Teams tab canonical_name; when null, apps fall back to teams.name.';
