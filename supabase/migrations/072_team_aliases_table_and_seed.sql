-- `team_aliases`: indexes for team_id + normalized_alias lookups (Teams sheet sync owns rows).
-- No mapped_name seeding. Legacy DBs may already have this table; we only add missing columns and indexes.

drop index if exists public.team_aliases_alias_norm_uidx;

create table if not exists public.team_aliases (
  id bigserial primary key,
  team_id bigint references public.teams (id) on delete cascade,
  alias text not null,
  normalized_alias text,
  created_at timestamptz not null default now()
);

alter table public.team_aliases add column if not exists team_id bigint references public.teams (id) on delete cascade;
alter table public.team_aliases add column if not exists normalized_alias text;

create index if not exists team_aliases_team_id_idx on public.team_aliases (team_id);

-- Non-unique: duplicate normalized aliases may exist until data is cleaned.
create index if not exists team_aliases_normalized_alias_lower_idx
  on public.team_aliases (lower(trim(normalized_alias)))
  where normalized_alias is not null;

alter table public.team_aliases enable row level security;

drop policy if exists team_aliases_select_public on public.team_aliases;
create policy team_aliases_select_public on public.team_aliases for select using (true);

drop policy if exists team_aliases_insert_admin on public.team_aliases;
create policy team_aliases_insert_admin on public.team_aliases for insert with check (public.is_app_admin(auth.uid()));

drop policy if exists team_aliases_update_admin on public.team_aliases;
create policy team_aliases_update_admin
on public.team_aliases for update
using (public.is_app_admin(auth.uid()))
with check (public.is_app_admin(auth.uid()));

drop policy if exists team_aliases_delete_admin on public.team_aliases;
create policy team_aliases_delete_admin on public.team_aliases for delete using (public.is_app_admin(auth.uid()));
