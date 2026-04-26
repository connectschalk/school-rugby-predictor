alter table public.user_profiles
  add column if not exists first_name text,
  add column if not exists surname text;
