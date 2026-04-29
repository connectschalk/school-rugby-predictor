create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mode text not null,
  replace_upcoming boolean not null default false,
  incoming_rows integer not null default 0,
  inserted_upcoming integer not null default 0,
  updated_upcoming integer not null default 0,
  inserted_completed integer not null default 0,
  updated_completed integer not null default 0,
  skipped_duplicates integer not null default 0,
  validation_errors jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb
);

alter table public.sync_runs enable row level security;

create index if not exists sync_runs_created_at_idx
  on public.sync_runs (created_at desc);

grant select, insert on public.sync_runs to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sync_runs'
      and policyname = 'sync_runs_admin_select'
  ) then
    create policy sync_runs_admin_select
      on public.sync_runs
      for select
      to authenticated
      using (public.is_app_admin(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sync_runs'
      and policyname = 'sync_runs_admin_insert'
  ) then
    create policy sync_runs_admin_insert
      on public.sync_runs
      for insert
      to authenticated
      with check (public.is_app_admin(auth.uid()));
  end if;
end $$;
