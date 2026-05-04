-- Team-level provinces on fixtures (separate from match province_group context).
-- Province-following pools: include matches linked by group OR where home/away team
-- province or province_group matches a province-type fixture group (incl. interprovincial).

alter table public.game_matches
  add column if not exists home_team_province text,
  add column if not exists away_team_province text;

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
      and fg.slug not in ('prestige-pool', 'interprovincial')
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
        or (
          nullif(trim(p_province_group), '') is not null
          and (
            lower(trim(p_province_group)) = lower(trim(fg.name))
            or public.slugify_group_name(trim(p_province_group)) = fg.slug
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
              or lower(trim(fga.alias)) = lower(trim(coalesce(p_province_group, '')))
            )
        )
      )
  );
$$;

create or replace function public.pool_effective_matches(
  p_pool_id uuid,
  p_week_start date default null
)
returns table (
  match_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with selected_groups as (
    select pg.group_id
    from public.pool_groups pg
    where pg.pool_id = p_pool_id
  ),
  fallback_group as (
    select fg.id as group_id
    from public.fixture_groups fg
    where fg.slug = 'prestige-pool'
    limit 1
  ),
  effective_groups as (
    select sg.group_id from selected_groups sg
    union all
    select fg.group_id
    from fallback_group fg
    where not exists (select 1 from selected_groups)
  ),
  by_links as (
    select distinct gm.id as match_id
    from public.game_matches gm
    join public.game_match_groups gmg on gmg.match_id = gm.id
    where gmg.group_id in (select eg.group_id from effective_groups eg)
      and gm.status <> 'cancelled'
  ),
  by_province_follow as (
    select distinct gm.id as match_id
    from public.game_matches gm
    join selected_groups sg on true
    join public.fixture_groups fg on fg.id = sg.group_id
    where gm.status <> 'cancelled'
      and public.pool_match_follows_province_group(
        gm.home_team_province,
        gm.away_team_province,
        gm.province_group,
        fg.id
      )
  )
  select by_links.match_id from by_links
  union
  select by_province_follow.match_id from by_province_follow;
$$;

create or replace function public.preview_pool_groups(
  p_group_ids uuid[]
)
returns table (
  total_matches bigint,
  teams text[],
  fixtures jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_fixture_group_teams boolean := true;
begin
  begin
    perform 1 from public.fixture_group_teams limit 1;
  exception
    when undefined_table then
      v_has_fixture_group_teams := false;
  end;

  if v_has_fixture_group_teams then
    return query
    with selected_groups as (
      select unnest(coalesce(p_group_ids, array[]::uuid[])) as group_id
    ),
    core_group_teams as (
      select
        fgt.group_id,
        fgt.team_name as team,
        public.normalize_team_name_for_preview(fgt.team_name) as team_norm
      from public.fixture_group_teams fgt
      where fgt.group_id in (select group_id from selected_groups)
        and nullif(trim(fgt.team_name), '') is not null
    ),
    groups_with_core as (
      select distinct cgt.group_id
      from core_group_teams cgt
    ),
    matched_by_group as (
      select
        gmg.group_id,
        gm.id as match_id,
        gm.home_team,
        gm.away_team,
        gm.kickoff_time
      from public.game_matches gm
      join public.game_match_groups gmg on gmg.match_id = gm.id
      where gm.status <> 'cancelled'
        and gmg.group_id in (select group_id from selected_groups)
        and (
          gmg.group_id not in (select gwc.group_id from groups_with_core gwc)
          or exists (
            select 1
            from core_group_teams cgt
            where cgt.group_id = gmg.group_id
              and (
                cgt.team_norm = public.normalize_team_name_for_preview(gm.home_team)
                or cgt.team_norm = public.normalize_team_name_for_preview(gm.away_team)
              )
          )
        )
      union all
      select
        sg.group_id,
        gm.id as match_id,
        gm.home_team,
        gm.away_team,
        gm.kickoff_time
      from public.game_matches gm
      inner join selected_groups sg on true
      inner join public.fixture_groups fg on fg.id = sg.group_id
      where gm.status <> 'cancelled'
        and public.pool_match_follows_province_group(
          gm.home_team_province,
          gm.away_team_province,
          gm.province_group,
          fg.id
        )
    ),
    matched as (
      select
        mbg.match_id,
        min(mbg.home_team) as home_team,
        min(mbg.away_team) as away_team,
        min(mbg.kickoff_time) as kickoff_time
      from matched_by_group mbg
      group by mbg.match_id
    ),
    match_groups as (
      select
        x.match_id,
        array_agg(distinct x.name order by x.name) as group_names
      from (
        select
          gmg.match_id,
          fg.name
        from public.game_match_groups gmg
        join public.fixture_groups fg on fg.id = gmg.group_id
        where gmg.match_id in (select m.match_id from matched m)
          and gmg.group_id in (select group_id from selected_groups)
        union all
        select
          gm.id as match_id,
          fg.name
        from public.game_matches gm
        inner join selected_groups sg on true
        inner join public.fixture_groups fg on fg.id = sg.group_id
        where gm.id in (select m.match_id from matched m)
          and gm.status <> 'cancelled'
          and public.pool_match_follows_province_group(
            gm.home_team_province,
            gm.away_team_province,
            gm.province_group,
            fg.id
          )
      ) x
      group by x.match_id
    ),
    upcoming as (
      select
        m.match_id,
        m.home_team,
        m.away_team,
        m.kickoff_time,
        coalesce(mg.group_names, array[]::text[]) as group_names
      from matched m
      left join match_groups mg on mg.match_id = m.match_id
      where m.kickoff_time >= now()
      order by m.kickoff_time asc
      limit 10
    ),
    groups_without_core as (
      select sg.group_id
      from selected_groups sg
      where sg.group_id not in (select gwc.group_id from groups_with_core gwc)
    ),
    fallback_fixture_teams as (
      select
        mbg.group_id,
        mbg.home_team as team
      from matched_by_group mbg
      where mbg.group_id in (select group_id from groups_without_core)
      union all
      select
        mbg.group_id,
        mbg.away_team as team
      from matched_by_group mbg
      where mbg.group_id in (select group_id from groups_without_core)
    ),
    all_teams as (
      select array_agg(distinct t.team order by t.team) as teams
      from (
        select cgt.team from core_group_teams cgt
        union
        select fft.team from fallback_fixture_teams fft
      ) t
      where nullif(trim(t.team), '') is not null
    ),
    fixture_json as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'match_id', u.match_id,
            'home_team', u.home_team,
            'away_team', u.away_team,
            'kickoff_time', u.kickoff_time,
            'group_names', u.group_names
          )
          order by u.kickoff_time asc
        ),
        '[]'::jsonb
      ) as fixtures
      from upcoming u
    )
    select
      (select count(*) from matched)::bigint as total_matches,
      coalesce((select teams from all_teams), array[]::text[]) as teams,
      (select fixtures from fixture_json) as fixtures;
  else
    return query
    with selected_groups as (
      select unnest(coalesce(p_group_ids, array[]::uuid[])) as group_id
    ),
    matched as (
      select
        u.match_id,
        min(u.home_team) as home_team,
        min(u.away_team) as away_team,
        min(u.kickoff_time) as kickoff_time
      from (
        select
          gm.id as match_id,
          gm.home_team,
          gm.away_team,
          gm.kickoff_time
        from public.game_matches gm
        join public.game_match_groups gmg on gmg.match_id = gm.id
        where gm.status <> 'cancelled'
          and gmg.group_id in (select group_id from selected_groups)
        union all
        select
          gm.id as match_id,
          gm.home_team,
          gm.away_team,
          gm.kickoff_time
        from public.game_matches gm
        inner join selected_groups sg on true
        inner join public.fixture_groups fg on fg.id = sg.group_id
        where gm.status <> 'cancelled'
          and public.pool_match_follows_province_group(
            gm.home_team_province,
            gm.away_team_province,
            gm.province_group,
            fg.id
          )
      ) u
      group by u.match_id
    ),
    match_groups as (
      select
        x.match_id,
        array_agg(distinct x.name order by x.name) as group_names
      from (
        select
          gmg.match_id,
          fg.name
        from public.game_match_groups gmg
        join public.fixture_groups fg on fg.id = gmg.group_id
        where gmg.match_id in (select m.match_id from matched m)
          and gmg.group_id in (select group_id from selected_groups)
        union all
        select
          gm.id as match_id,
          fg.name
        from public.game_matches gm
        inner join selected_groups sg on true
        inner join public.fixture_groups fg on fg.id = sg.group_id
        where gm.id in (select m.match_id from matched m)
          and gm.status <> 'cancelled'
          and public.pool_match_follows_province_group(
            gm.home_team_province,
            gm.away_team_province,
            gm.province_group,
            fg.id
          )
      ) x
      group by x.match_id
    ),
    upcoming as (
      select
        m.match_id,
        m.home_team,
        m.away_team,
        m.kickoff_time,
        coalesce(mg.group_names, array[]::text[]) as group_names
      from matched m
      left join match_groups mg on mg.match_id = m.match_id
      where m.kickoff_time >= now()
      order by m.kickoff_time asc
      limit 10
    ),
    all_teams as (
      select array_agg(distinct t.team order by t.team) as teams
      from (
        select m.home_team as team from matched m
        union
        select m.away_team as team from matched m
      ) t
    ),
    fixture_json as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'match_id', u.match_id,
            'home_team', u.home_team,
            'away_team', u.away_team,
            'kickoff_time', u.kickoff_time,
            'group_names', u.group_names
          )
          order by u.kickoff_time asc
        ),
        '[]'::jsonb
      ) as fixtures
      from upcoming u
    )
    select
      (select count(*) from matched)::bigint as total_matches,
      coalesce((select teams from all_teams), array[]::text[]) as teams,
      (select fixtures from fixture_json) as fixtures;
  end if;
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

  if coalesce(new.is_prestige, false) = true then
    select id into v_group_id from public.fixture_groups where slug = 'prestige-pool' limit 1;
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
  home_team_province,
  away_team_province
on public.game_matches
for each row
execute function public.sync_game_match_groups_from_fields();

revoke all on function public.pool_match_follows_province_group(text, text, text, uuid) from public;

revoke all on function public.pool_effective_matches(uuid, date) from public;
grant execute on function public.pool_effective_matches(uuid, date) to authenticated;

revoke all on function public.preview_pool_groups(uuid[]) from public;
grant execute on function public.preview_pool_groups(uuid[]) to authenticated;
