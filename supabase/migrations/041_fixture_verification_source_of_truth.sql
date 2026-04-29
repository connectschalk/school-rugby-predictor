alter table public.game_matches
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists source_type text,
  add column if not exists imported_batch_id uuid,
  add column if not exists verification_status text default 'draft',
  add column if not exists verified_by text,
  add column if not exists verified_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists admin_notes text;

create table if not exists public.fixture_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_name text,
  source_url text,
  imported_by text,
  import_status text not null default 'draft',
  total_rows integer not null default 0,
  verified_rows integer not null default 0,
  rejected_rows integer not null default 0,
  notes text
);

alter table public.fixture_import_batches enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'game_matches_verification_status_check'
  ) then
    alter table public.game_matches
      add constraint game_matches_verification_status_check
      check (verification_status in ('draft', 'needs_review', 'verified', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fixture_import_batches_import_status_check'
  ) then
    alter table public.fixture_import_batches
      add constraint fixture_import_batches_import_status_check
      check (import_status in ('draft', 'processing', 'completed', 'failed'));
  end if;
end $$;

update public.game_matches
set verification_status = 'needs_review'
where verification_status is null
   or verification_status not in ('draft', 'needs_review', 'verified', 'rejected');

alter table public.game_matches
  alter column verification_status set default 'draft',
  alter column verification_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'game_matches_imported_batch_fk'
  ) then
    alter table public.game_matches
      add constraint game_matches_imported_batch_fk
      foreign key (imported_batch_id) references public.fixture_import_batches(id)
      on delete set null;
  end if;
end $$;

create index if not exists game_matches_verification_status_idx
  on public.game_matches (verification_status);

create index if not exists game_matches_imported_batch_id_idx
  on public.game_matches (imported_batch_id);

create unique index if not exists game_matches_verified_kickoff_pair_uidx
  on public.game_matches (
    kickoff_time,
    least(lower(trim(home_team)), lower(trim(away_team))),
    greatest(lower(trim(home_team)), lower(trim(away_team)))
  )
  where verification_status = 'verified';

grant select, insert, update, delete on public.fixture_import_batches to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'fixture_import_batches'
      and policyname = 'fixture_import_batches_admin_select'
  ) then
    create policy fixture_import_batches_admin_select
      on public.fixture_import_batches
      for select
      to authenticated
      using (public.is_app_admin(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'fixture_import_batches'
      and policyname = 'fixture_import_batches_admin_insert'
  ) then
    create policy fixture_import_batches_admin_insert
      on public.fixture_import_batches
      for insert
      to authenticated
      with check (public.is_app_admin(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'fixture_import_batches'
      and policyname = 'fixture_import_batches_admin_update'
  ) then
    create policy fixture_import_batches_admin_update
      on public.fixture_import_batches
      for update
      to authenticated
      using (public.is_app_admin(auth.uid()))
      with check (public.is_app_admin(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'fixture_import_batches'
      and policyname = 'fixture_import_batches_admin_delete'
  ) then
    create policy fixture_import_batches_admin_delete
      on public.fixture_import_batches
      for delete
      to authenticated
      using (public.is_app_admin(auth.uid()));
  end if;
end $$;
