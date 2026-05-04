-- Remap `game_match_groups.group_id` when it still points at an ad-hoc short-code `fixture_groups` row
-- (slug wp, fs, …). Runs before row is stored so strict validators on this table see canonical ids.
-- Related: `sync_game_match_groups_from_fields` (056) and app normalization on `game_matches` province columns.

create or replace function public.rewrite_game_match_groups_short_slug_group_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_new uuid;
begin
  select lower(trim(fg.slug)) into v_slug
  from public.fixture_groups fg
  where fg.id = new.group_id;

  if v_slug is null then
    return new;
  end if;

  v_new := case v_slug
    when 'wp' then (select id from public.fixture_groups where slug = 'western-province' limit 1)
    when 'ep' then (select id from public.fixture_groups where slug = 'eastern-cape' limit 1)
    when 'fs' then (select id from public.fixture_groups where slug = 'free-state-griquas' limit 1)
    when 'gp' then (select id from public.fixture_groups where slug = 'noordvaal' limit 1)
    when 'kzn' then (select id from public.fixture_groups where slug = 'kwazulu-natal' limit 1)
    when 'nc' then (select id from public.fixture_groups where slug = 'free-state-griquas' limit 1)
    when 'bl' then (select id from public.fixture_groups where slug = 'boland' limit 1)
    when 'swd' then (select id from public.fixture_groups where slug = 'south-western-districts' limit 1)
    when 'bul' then (select id from public.fixture_groups where slug = 'noordvaal' limit 1)
    when 'leo' then (select id from public.fixture_groups where slug = 'noordvaal' limit 1)
    when 'lim' then (select id from public.fixture_groups where slug = 'noordvaal' limit 1)
    when 'pum' then (select id from public.fixture_groups where slug = 'noordvaal' limit 1)
    else null
  end;

  if v_new is not null then
    new.group_id := v_new;
  end if;

  return new;
end;
$$;

revoke all on function public.rewrite_game_match_groups_short_slug_group_id() from public;

drop trigger if exists trg_rewrite_game_match_groups_short_slug on public.game_match_groups;
create trigger trg_rewrite_game_match_groups_short_slug
before insert or update of group_id on public.game_match_groups
for each row
execute function public.rewrite_game_match_groups_short_slug_group_id();
