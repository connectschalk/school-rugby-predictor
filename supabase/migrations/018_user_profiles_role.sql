-- Role for internal tools access (see lib/admin-access.ts). Default: user.

alter table public.user_profiles
  add column if not exists role text not null default 'user';

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('user', 'admin'));

comment on column public.user_profiles.role is 'user = default; admin = school predictor internal tools.';

-- After deploy, grant admin in SQL Editor, e.g.:
-- update public.user_profiles set role = 'admin' where id = '<auth.users id>';
