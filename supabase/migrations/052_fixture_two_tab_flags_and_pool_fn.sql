-- Two-tab model flags: interprovincial / explicit prestige match / WP Elite participation.
-- Province pool follow uses team provinces only (legacy province_group param kept for signature compat but ignored).
-- WP Elite fixture group for pool linking.

alter table public.game_matches
  add column if not exists is_interprovincial boolean not null default false,
  add column if not exists is_prestige_match boolean,
  add column if not exists has_wp_elite_team boolean not null default false;

insert into public.fixture_groups (name, slug, group_type, is_active)
values ('WP Elite', 'wp-elite', 'custom', true)
on conflict (slug) do update
set name = excluded.name,
    group_type = excluded.group_type,
    is_active = excluded.is_active;

create or replace function public.pool_match_follows_province_group(
  p_home_team_province text,
  p_away_team_province text,
  p_province_group text,
  p_fixture_group_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.fixture_groups fg
    where fg.id = p_fixture_group_id
      and fg.slug not in ('prestige-pool', 'interprovincial', 'wp-elite')
      and coalesce(fg.group_type, 'custom') not in ('league', 'tournament', 'prestige')
      and (
        (
          nullif(trim(p_home_team_province), '') is not null
          and (
            lower(trim(p_home_team_province)) = lower(trim(fg.name))
            or public.slugify_group_name(trim(p_home_team_province)) = fg.slug
          )
        )
        or (
          nullif(trim(p_away_team_province), '') is not null
          and (
            lower(trim(p_away_team_province)) = lower(trim(fg.name))
            or public.slugify_group_name(trim(p_away_team_province)) = fg.slug
          )
        )
        or exists (
          select 1
          from public.fixture_group_aliases fga
          where fga.group_id = fg.id
            and nullif(trim(fga.alias), '') is not null
            and (
              lower(trim(fga.alias)) = lower(trim(coalesce(p_home_team_province, '')))
              or lower(trim(fga.alias)) = lower(trim(coalesce(p_away_team_province, '')))
            )
        )
      )
  );
$$;

create or replace function public.sync_game_match_groups_from_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_group_id uuid;
begin
  delete from public.game_match_groups where match_id = new.id;

  if nullif(trim(coalesce(new.league_group, '')), '') is not null then
    v_slug := public.slugify_group_name(new.league_group);
    insert into public.fixture_groups (name, slug, group_type, is_active)
    values (trim(new.league_group), v_slug, 'league', false)
    on conflict (slug) do nothing;

    select id into v_group_id from public.fixture_groups where slug = v_slug limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  if nullif(trim(coalesce(new.tournament, '')), '') is not null then
    v_slug := public.slugify_group_name(new.tournament);
    insert into public.fixture_groups (name, slug, group_type, is_active)
    values (trim(new.tournament), v_slug, 'tournament', false)
    on conflict (slug) do nothing;

    select id into v_group_id from public.fixture_groups where slug = v_slug limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  if coalesce(new.is_interprovincial, false) = true then
    select id into v_group_id from public.fixture_groups where slug = 'interprovincial' limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  if coalesce(new.is_prestige, false) = true then
    select id into v_group_id from public.fixture_groups where slug = 'prestige-pool' limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  if coalesce(new.has_wp_elite_team, false) = true then
    select id into v_group_id from public.fixture_groups where slug = 'wp-elite' limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  if nullif(trim(coalesce(new.province_group, '')), '') is not null then
    v_slug := public.slugify_group_name(new.province_group);
    insert into public.fixture_groups (name, slug, group_type, is_active)
    values (trim(new.province_group), v_slug, 'province', false)
    on conflict (slug) do nothing;

    select id into v_group_id from public.fixture_groups where slug = v_slug limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  if nullif(trim(coalesce(new.home_team_province, '')), '') is not null then
    v_slug := public.slugify_group_name(new.home_team_province);
    insert into public.fixture_groups (name, slug, group_type, is_active)
    values (trim(new.home_team_province), v_slug, 'province', false)
    on conflict (slug) do nothing;

    select id into v_group_id from public.fixture_groups where slug = v_slug limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  if nullif(trim(coalesce(new.away_team_province, '')), '') is not null then
    v_slug := public.slugify_group_name(new.away_team_province);
    insert into public.fixture_groups (name, slug, group_type, is_active)
    values (trim(new.away_team_province), v_slug, 'province', false)
    on conflict (slug) do nothing;

    select id into v_group_id from public.fixture_groups where slug = v_slug limit 1;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_game_match_groups_from_fields on public.game_matches;
create trigger trg_sync_game_match_groups_from_fields
after insert or update of
  province_group,
  league_group,
  tournament,
  is_prestige,
  is_interprovincial,
  has_wp_elite_team,
  is_prestige_match,
  home_team_province,
  away_team_province
on public.game_matches
for each row
execute function public.sync_game_match_groups_from_fields();
