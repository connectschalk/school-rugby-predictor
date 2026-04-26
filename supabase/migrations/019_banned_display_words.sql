-- Banned display-name words + moderation helpers. Idempotent.
-- Enforcement: BEFORE trigger on user_profiles (a CHECK constraint cannot reference
--   banned_display_words; behaviour matches “display_name must not contain banned word” when set).
-- Null display_name is allowed for legacy rows; non-null non-blank values are moderated.

create table if not exists public.banned_display_words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  language text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint banned_display_words_word_key unique (word)
);

comment on table public.banned_display_words is
  'Store lowercase letter-only tokens; substring match after normalize_display_name_for_moderation. Extend via insert (service role / SQL editor).';

insert into public.banned_display_words (word, language, is_active) values
  ('fuck', 'en', true),
  ('shit', 'en', true),
  ('bitch', 'en', true),
  ('asshole', 'en', true),
  ('dick', 'en', true),
  ('cunt', 'en', true),
  ('poes', 'af', true),
  ('fok', 'af', true),
  ('fokken', 'af', true),
  ('kak', 'af', true),
  ('doos', 'af', true),
  ('piel', 'af', true),
  ('naai', 'af', true)
on conflict (word) do nothing;

-- Lowercase, strip spaces, leet-ish map (@→a, 0→o, …), then letters a–z only.
create or replace function public.normalize_display_name_for_moderation(input text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      translate(
        regexp_replace(lower(trim(coalesce(input, ''))), '\s', '', 'g'),
        '@013457',
        'aoeiast'
      ),
      '[^a-z]',
      '',
      'g'
    ),
    ''
  );
$$;

comment on function public.normalize_display_name_for_moderation(text) is
  'Align with lib/display-name-filter.ts normalizeDisplayNameForModeration.';

create or replace function public.contains_banned_display_word(input text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  n text;
begin
  n := public.normalize_display_name_for_moderation(input);
  if n is null or length(n) = 0 then
    return false;
  end if;
  return exists (
    select 1
    from public.banned_display_words b
    where b.is_active
      and length(trim(b.word)) > 0
      and position(lower(trim(b.word)) in n) > 0
  );
end;
$$;

comment on function public.contains_banned_display_word(text) is
  'True when normalized input contains any active banned word substring.';

create or replace function public.enforce_user_profiles_display_name_moderation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_name is not null and length(trim(new.display_name)) > 0 then
    if public.contains_banned_display_word(new.display_name) then
      raise exception 'DISPLAY_NAME_NOT_ALLOWED'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_display_name_moderation on public.user_profiles;

create trigger user_profiles_display_name_moderation
  before insert or update of display_name on public.user_profiles
  for each row
  execute function public.enforce_user_profiles_display_name_moderation();

comment on trigger user_profiles_display_name_moderation on public.user_profiles is
  'Rejects non-null display_name values that match banned_display_words after normalization.';

alter table public.banned_display_words enable row level security;

-- No policies: clients cannot list words; service_role / postgres still maintain via SQL.
