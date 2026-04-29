alter table public.sync_runs
  add column if not exists would_link_groups integer not null default 0,
  add column if not exists linked_groups integer not null default 0,
  add column if not exists group_link_warnings integer not null default 0;
