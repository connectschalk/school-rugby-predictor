-- Custom avatar for Buks Scott (public asset: /avatars/buks-scott.png).

update public.user_profiles
set avatar_url = '/avatars/buks-scott.png'
where lower(trim(coalesce(display_name, ''))) = 'buks scott'
   or (
     lower(trim(coalesce(first_name, ''))) = 'buks'
     and lower(trim(coalesce(surname, ''))) = 'scott'
   );

comment on column public.user_profiles.avatar_url is
  'Optional image path or URL; when set, UI shows this instead of letter avatar.';
