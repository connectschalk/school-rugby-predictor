-- Prefer fixture_group_aliases over ad-hoc short-code fixture_groups rows (slug wp, ep, …).
-- Aligns resolve_fixture_group_alias + sync_game_match_groups_from_fields with canonical provinces.

create or replace function public.resolve_fixture_group_alias(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_slug text;
  v_group_id uuid;
begin
  if v_name = '' then
    return null;
  end if;

  -- Aliases first (WP, FS, BL, … → canonical province / union fixture_groups.id).
  select fga.group_id into v_group_id
  from public.fixture_group_aliases fga
  where lower(fga.alias) = lower(v_name)
  limit 1;

  if v_group_id is not null then
    return v_group_id;
  end if;

  v_slug := public.slugify_group_name(v_name);

  -- Exact canonical name/slug, but never ad-hoc short-code duplicate rows.
  select fg.id into v_group_id
  from public.fixture_groups fg
  where (
      lower(fg.name) = lower(v_name)
      or fg.slug = v_slug
    )
    and fg.slug not in (
      'wp', 'ep', 'fs', 'gp', 'kzn', 'nc', 'bl', 'swd', 'bul', 'leo', 'lim', 'pum'
    )
  order by fg.created_at asc
  limit 1;

  return v_group_id;
end;
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
    select id into v_group_id from public.fixture_groups where slug = 'wp-premium' limit 1;
    if v_group_id is null then
      select id into v_group_id from public.fixture_groups where slug = 'wp-elite' limit 1;
    end if;
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    end if;
  end if;

  if nullif(trim(coalesce(new.province_group, '')), '') is not null then
    v_group_id := public.resolve_fixture_group_alias(trim(new.province_group));
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    else
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
  end if;

  if nullif(trim(coalesce(new.home_team_province, '')), '') is not null then
    v_group_id := public.resolve_fixture_group_alias(trim(new.home_team_province));
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    else
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
  end if;

  if nullif(trim(coalesce(new.away_team_province, '')), '') is not null then
    v_group_id := public.resolve_fixture_group_alias(trim(new.away_team_province));
    if v_group_id is not null then
      insert into public.game_match_groups (match_id, group_id)
      values (new.id, v_group_id)
      on conflict do nothing;
    else
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
  end if;

  return new;
end;
$$;
