alter table public.sync_runs
  add column if not exists reactivated_upcoming integer not null default 0,
  add column if not exists rejected_old_upcoming integer not null default 0,
  add column if not exists province_group_warnings integer not null default 0;
