-- Default General category helper; never block content on missing categories.

create or replace function public.ensure_default_memory_category(p_memory_map_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_accent text;
begin
  if p_memory_map_id is null then
    raise exception 'memory map id required';
  end if;

  select id into v_id
  from public.memory_categories
  where memory_map_id = p_memory_map_id
    and is_active = true
    and lower(name) = 'general'
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  select coalesce(nullif(trim(accent_color), ''), '#FFD400') into v_accent
  from public.memory_maps
  where id = p_memory_map_id;

  insert into public.memory_categories (
    memory_map_id, name, description, icon, colour, sort_order, is_active
  ) values (
    p_memory_map_id,
    'General',
    'General memories and uncategorised stories',
    'pin',
    coalesce(v_accent, '#FFD400'),
    0,
    true
  )
  on conflict (memory_map_id, name) do update
  set
    is_active = true,
    description = coalesce(public.memory_categories.description, excluded.description),
    icon = coalesce(public.memory_categories.icon, excluded.icon)
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.memory_categories
    where memory_map_id = p_memory_map_id and lower(name) = 'general'
    limit 1;
  end if;

  return v_id;
end;
$$;

revoke all on function public.ensure_default_memory_category(uuid) from public;
grant execute on function public.ensure_default_memory_category(uuid) to authenticated;

-- Backfill General for maps that have no active categories.
do $$
declare
  v_map_id uuid;
begin
  for v_map_id in
    select m.id
    from public.memory_maps m
    where not exists (
      select 1 from public.memory_categories c
      where c.memory_map_id = m.id and c.is_active = true
    )
  loop
    perform public.ensure_default_memory_category(v_map_id);
  end loop;
end $$;

-- Platform map creation: always seed General.
create or replace function public.create_memory_map_platform(
  p_org_name text,
  p_org_type text,
  p_org_slug text,
  p_org_description text default null,
  p_org_logo_url text default null,
  p_map_title text default null,
  p_map_slug text default null,
  p_tagline text default null,
  p_description text default null,
  p_visibility text default 'link_only',
  p_status text default 'draft',
  p_profile_image_url text default null,
  p_landing_background_url text default null,
  p_primary_color text default '#FFD400',
  p_accent_color text default '#FFD400',
  p_sponsor_name text default null,
  p_sponsor_logo_url text default null,
  p_sponsor_website_url text default null,
  p_sponsor_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_map_id uuid;
  v_org_slug text := lower(trim(regexp_replace(coalesce(p_org_slug, ''), '[^a-z0-9-]+', '-', 'g')));
  v_map_slug text := lower(trim(regexp_replace(coalesce(p_map_slug, ''), '[^a-z0-9-]+', '-', 'g')));
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_app_admin(v_uid) then raise exception 'forbidden'; end if;
  if v_org_slug = '' or v_map_slug = '' then raise exception 'invalid slug'; end if;
  if p_org_name is null or trim(p_org_name) = '' then raise exception 'organisation name required'; end if;
  if p_map_title is null or trim(p_map_title) = '' then raise exception 'map title required'; end if;

  insert into public.organisations (name, slug, type, description, logo_url, created_by)
  values (
    trim(p_org_name), v_org_slug, coalesce(p_org_type, 'school'),
    nullif(trim(coalesce(p_org_description, '')), ''),
    nullif(trim(coalesce(p_org_logo_url, '')), ''),
    v_uid
  )
  returning id into v_org_id;

  insert into public.memory_maps (
    organisation_id, title, slug, tagline, description,
    visibility, status, profile_image_url, landing_background_url,
    primary_color, accent_color,
    sponsor_name, sponsor_logo_url, sponsor_website_url, sponsor_message,
    created_by
  ) values (
    v_org_id, trim(p_map_title), v_map_slug,
    nullif(trim(coalesce(p_tagline, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    coalesce(p_visibility, 'link_only'), coalesce(p_status, 'draft'),
    nullif(trim(coalesce(p_profile_image_url, '')), ''),
    nullif(trim(coalesce(p_landing_background_url, '')), ''),
    coalesce(nullif(trim(p_primary_color), ''), '#FFD400'),
    coalesce(nullif(trim(p_accent_color), ''), '#FFD400'),
    nullif(trim(coalesce(p_sponsor_name, '')), ''),
    nullif(trim(coalesce(p_sponsor_logo_url, '')), ''),
    nullif(trim(coalesce(p_sponsor_website_url, '')), ''),
    nullif(trim(coalesce(p_sponsor_message, '')), ''),
    v_uid
  )
  returning id into v_map_id;

  perform public.ensure_default_memory_category(v_map_id);

  insert into public.memory_map_members (memory_map_id, user_id, role, status, approved_by, approved_at)
  values (v_map_id, v_uid, 'admin', 'approved', v_uid, now())
  on conflict (memory_map_id, user_id) do update
  set role = 'admin', status = 'approved', approved_by = v_uid, approved_at = now();

  perform public.create_memory_audit_log(
    v_map_id, 'map_created', 'map', v_map_id, null,
    jsonb_build_object('org_id', v_org_id, 'slug', v_map_slug), null
  );

  return v_map_id;
end;
$$;

-- Contributor submit: auto General category for new pins.
do $$
declare
  r record;
begin
  for r in
    select pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_memory_story'
  loop
    execute format('drop function if exists public.submit_memory_story(%s)', r.args);
  end loop;
end $$;

create or replace function public.submit_memory_story(
  p_memory_map_id uuid,
  p_area_id uuid,
  p_existing_pin_id uuid default null,
  p_pin_title text default null,
  p_pin_description text default null,
  p_pin_category_id uuid default null,
  p_pin_lat double precision default null,
  p_pin_lng double precision default null,
  p_pin_x double precision default null,
  p_pin_y double precision default null,
  p_title text default null,
  p_description text default null,
  p_story_type text default 'text',
  p_event_year integer default null,
  p_upload_mode text default 'manual_geo',
  p_risk_level text default 'low',
  p_logged_by_display_name text default null,
  p_has_permission_confirmed boolean default false,
  p_contains_minors boolean default false,
  p_mentions_full_names boolean default false,
  p_shows_injury boolean default false,
  p_is_archive_content boolean default false,
  p_sponsor_or_brand_visible boolean default false,
  p_tags text[] default '{}',
  p_media jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pin_id uuid;
  v_story_id uuid;
  v_area public.memory_areas;
  v_cat_colour text;
  v_category_id uuid;
  v_tag text;
  v_tag_id uuid;
  v_media jsonb;
  v_sort integer := 0;
  v_title text;
  v_description text;
  v_policy_ok boolean := false;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_contributor(p_memory_map_id, v_uid) then
    raise exception 'contributor access required';
  end if;

  select exists (
    select 1 from public.memory_map_members m
    where m.memory_map_id = p_memory_map_id and m.user_id = v_uid
      and m.status = 'approved' and m.submission_policy_accepted_at is not null
  ) into v_policy_ok;

  if not coalesce(p_has_permission_confirmed, false)
     and not coalesce(v_policy_ok, false)
     and not public.is_app_admin(v_uid) then
    raise exception 'submission policy acceptance required';
  end if;

  v_description := trim(coalesce(p_description, ''));
  v_title := coalesce(nullif(trim(coalesce(p_title, '')), ''), nullif(left(v_description, 80), ''));
  if v_title is null then raise exception 'title required'; end if;
  if v_description = '' then v_description := v_title; end if;
  if p_event_year is null or p_event_year < 1800 or p_event_year > 2100 then
    raise exception 'valid event year required';
  end if;

  select * into v_area from public.memory_areas
  where id = p_area_id and memory_map_id = p_memory_map_id and is_active = true;
  if not found then raise exception 'invalid area'; end if;

  if p_existing_pin_id is not null then
    v_pin_id := p_existing_pin_id;
    if not exists (
      select 1 from public.memory_pins p
      join public.memory_areas ma on ma.id = p.area_id
      where p.id = v_pin_id and ma.memory_map_id = p_memory_map_id
    ) then raise exception 'invalid pin'; end if;
  else
    if trim(coalesce(p_pin_title, '')) = '' then raise exception 'pin title required'; end if;
    if v_area.map_type = 'geo' and (p_pin_lat is null or p_pin_lng is null) then
      raise exception 'geo pin location required';
    end if;
    if v_area.map_type = 'image' and (p_pin_x is null or p_pin_y is null) then
      raise exception 'image map pin position required';
    end if;

    v_category_id := coalesce(p_pin_category_id, public.ensure_default_memory_category(p_memory_map_id));
    select colour into v_cat_colour from public.memory_categories where id = v_category_id;

    insert into public.memory_pins (
      area_id, category_id, title, description, lat, lng, x_position, y_position,
      status, colour, created_by, updated_by
    ) values (
      p_area_id, v_category_id, trim(p_pin_title), nullif(trim(coalesce(p_pin_description, '')), ''),
      p_pin_lat, p_pin_lng, p_pin_x, p_pin_y,
      'pending', coalesce(v_cat_colour, '#FFD400'), v_uid, v_uid
    )
    returning id into v_pin_id;

    perform public.create_memory_audit_log(
      p_memory_map_id, 'pin_created', 'pin', v_pin_id, null,
      jsonb_build_object('title', trim(p_pin_title)), null
    );
  end if;

  insert into public.memory_stories (
    pin_id, title, description, story_type, event_year, uploaded_by,
    logged_by_display_name, upload_mode, risk_level, status, has_permission_confirmed,
    contains_minors, mentions_full_names, shows_injury, is_archive_content, sponsor_or_brand_visible
  ) values (
    v_pin_id, v_title, v_description, coalesce(p_story_type, 'mixed'),
    p_event_year, v_uid, nullif(trim(coalesce(p_logged_by_display_name, '')), ''),
    coalesce(p_upload_mode, 'manual_geo'), coalesce(p_risk_level, 'low'),
    'pending_review', true,
    coalesce(p_contains_minors, false), coalesce(p_mentions_full_names, false),
    coalesce(p_shows_injury, false), coalesce(p_is_archive_content, false),
    coalesce(p_sponsor_or_brand_visible, false)
  )
  returning id into v_story_id;

  if p_media is not null and jsonb_typeof(p_media) = 'array' then
    for v_media in select * from jsonb_array_elements(p_media) loop
      insert into public.memory_story_media (
        story_id, media_type, file_url, thumbnail_url, file_name, file_size, mime_type, sort_order
      ) values (
        v_story_id, coalesce(v_media->>'media_type', 'image'), v_media->>'file_url',
        v_media->>'thumbnail_url', v_media->>'file_name',
        nullif(v_media->>'file_size', '')::integer, v_media->>'mime_type',
        coalesce((v_media->>'sort_order')::integer, v_sort)
      );
      v_sort := v_sort + 1;
    end loop;
  end if;

  if p_tags is not null then
    foreach v_tag in array p_tags loop
      v_tag := lower(trim(v_tag));
      if v_tag = '' then continue; end if;
      insert into public.memory_tags (memory_map_id, name) values (p_memory_map_id, v_tag)
      on conflict (memory_map_id, name) do nothing;
      select id into v_tag_id from public.memory_tags
      where memory_map_id = p_memory_map_id and name = v_tag;
      if v_tag_id is not null then
        insert into public.memory_story_tags (story_id, tag_id) values (v_story_id, v_tag_id)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  perform public.create_memory_audit_log(
    p_memory_map_id, 'story_submitted', 'story', v_story_id, null,
    jsonb_build_object('pin_id', v_pin_id, 'upload_mode', p_upload_mode, 'event_year', p_event_year),
    null
  );

  return v_story_id;
end;
$$;

revoke all on function public.submit_memory_story(
  uuid, uuid, uuid, text, text, uuid, double precision, double precision, double precision, double precision,
  text, text, text, integer, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text[], jsonb
) from public;
grant execute on function public.submit_memory_story(
  uuid, uuid, uuid, text, text, uuid, double precision, double precision, double precision, double precision,
  text, text, text, integer, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text[], jsonb
) to authenticated;

-- Admin create content: auto General category.
create or replace function public.admin_create_memory_story(
  p_memory_map_id uuid,
  p_area_id uuid,
  p_existing_pin_id uuid,
  p_create_new_pin boolean,
  p_pin_title text,
  p_pin_description text,
  p_pin_category_id uuid,
  p_pin_lat double precision,
  p_pin_lng double precision,
  p_pin_x_position double precision,
  p_pin_y_position double precision,
  p_story_title text,
  p_story_description text,
  p_event_year integer,
  p_event_date date,
  p_category_id uuid,
  p_tags text[],
  p_story_type text,
  p_upload_mode text,
  p_risk_level text,
  p_logged_by_display_name text,
  p_is_official boolean,
  p_pin_is_official boolean,
  p_status text,
  p_governance_flags jsonb,
  p_media jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pin_id uuid;
  v_story_id uuid;
  v_area public.memory_areas;
  v_cat_colour text;
  v_pin_category uuid;
  v_tag text;
  v_tag_id uuid;
  v_media jsonb;
  v_sort integer := 0;
  v_story_status text;
  v_pin_status text;
  v_flags jsonb;
  v_audit_action text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_admin(p_memory_map_id, v_uid) then
    raise exception 'admin access required';
  end if;

  v_story_status := coalesce(nullif(trim(p_status), ''), 'approved');
  if v_story_status not in ('draft', 'pending_review', 'approved') then
    raise exception 'invalid story status';
  end if;

  if trim(coalesce(p_story_title, '')) = '' then raise exception 'title required'; end if;
  if trim(coalesce(p_story_description, '')) = '' then
    p_story_description := trim(p_story_title);
  end if;
  if p_event_year is null or p_event_year < 1800 or p_event_year > 2100 then
    raise exception 'valid event year required';
  end if;

  select * into v_area from public.memory_areas
  where id = p_area_id and memory_map_id = p_memory_map_id and is_active = true;
  if not found then raise exception 'invalid area'; end if;

  v_pin_category := coalesce(
    p_pin_category_id,
    p_category_id,
    public.ensure_default_memory_category(p_memory_map_id)
  );

  select colour into v_cat_colour from public.memory_categories
  where id = v_pin_category and memory_map_id = p_memory_map_id;

  v_flags := coalesce(p_governance_flags, '{}'::jsonb) || jsonb_build_object('admin_created', true);
  v_pin_status := case when v_story_status = 'approved' then 'approved' else 'pending' end;

  if coalesce(p_create_new_pin, false) or p_existing_pin_id is null then
    if trim(coalesce(p_pin_title, '')) = '' then raise exception 'pin title required'; end if;
    if v_area.map_type = 'geo' and (p_pin_lat is null or p_pin_lng is null) then
      raise exception 'geo pin location required';
    end if;
    if v_area.map_type = 'image' and (p_pin_x_position is null or p_pin_y_position is null) then
      raise exception 'image map pin position required';
    end if;

    insert into public.memory_pins (
      area_id, category_id, title, description, lat, lng, x_position, y_position,
      status, is_official, colour, created_by, updated_by
    ) values (
      p_area_id, v_pin_category, trim(p_pin_title), nullif(trim(coalesce(p_pin_description, '')), ''),
      p_pin_lat, p_pin_lng, p_pin_x_position, p_pin_y_position,
      v_pin_status, coalesce(p_pin_is_official, p_is_official, false),
      coalesce(v_cat_colour, '#FFD400'), v_uid, v_uid
    )
    returning id into v_pin_id;

    perform public.create_memory_audit_log(
      p_memory_map_id, 'pin_created', 'pin', v_pin_id, null,
      jsonb_build_object('title', trim(p_pin_title), 'admin_created', true), null
    );

    if coalesce(p_pin_is_official, p_is_official, false) then
      perform public.create_memory_audit_log(
        p_memory_map_id, 'official_pin_created', 'pin', v_pin_id, null,
        jsonb_build_object('title', trim(p_pin_title)), null
      );
    end if;
  else
    v_pin_id := p_existing_pin_id;
    if not exists (
      select 1 from public.memory_pins p
      join public.memory_areas ma on ma.id = p.area_id
      where p.id = v_pin_id and ma.memory_map_id = p_memory_map_id
    ) then
      raise exception 'invalid pin';
    end if;
  end if;

  insert into public.memory_stories (
    pin_id, title, description, story_type, event_year, event_date, uploaded_by,
    logged_by_display_name, upload_mode, risk_level, status, is_official, governance_flags,
    has_permission_confirmed, contains_minors, mentions_full_names, shows_injury,
    is_archive_content, sponsor_or_brand_visible, approved_by, approved_at
  ) values (
    v_pin_id, trim(p_story_title), trim(p_story_description), coalesce(p_story_type, 'mixed'),
    p_event_year, p_event_date, v_uid,
    nullif(trim(coalesce(p_logged_by_display_name, '')), ''),
    coalesce(p_upload_mode, 'archive_submission'), coalesce(p_risk_level, 'low'),
    v_story_status, coalesce(p_is_official, false), v_flags,
    coalesce((v_flags->>'has_permission_confirmed')::boolean, true),
    coalesce((v_flags->>'contains_minors')::boolean, false),
    coalesce((v_flags->>'mentions_full_names')::boolean, false),
    coalesce((v_flags->>'shows_injury')::boolean, false),
    coalesce((v_flags->>'is_archive_content')::boolean, false),
    coalesce((v_flags->>'sponsor_or_brand_visible')::boolean, false),
    case when v_story_status = 'approved' then v_uid else null end,
    case when v_story_status = 'approved' then now() else null end
  )
  returning id into v_story_id;

  if p_media is not null and jsonb_typeof(p_media) = 'array' then
    for v_media in select * from jsonb_array_elements(p_media) loop
      insert into public.memory_story_media (
        story_id, media_type, file_url, thumbnail_url, file_name, file_size, mime_type, sort_order
      ) values (
        v_story_id, coalesce(v_media->>'media_type', 'image'), v_media->>'file_url',
        v_media->>'thumbnail_url', v_media->>'file_name',
        nullif(v_media->>'file_size', '')::integer, v_media->>'mime_type',
        coalesce((v_media->>'sort_order')::integer, v_sort)
      );
      v_sort := v_sort + 1;
    end loop;
  end if;

  if p_tags is not null then
    foreach v_tag in array p_tags loop
      v_tag := lower(trim(v_tag));
      if v_tag = '' then continue; end if;
      insert into public.memory_tags (memory_map_id, name) values (p_memory_map_id, v_tag)
      on conflict (memory_map_id, name) do nothing;
      select id into v_tag_id from public.memory_tags
      where memory_map_id = p_memory_map_id and name = v_tag;
      if v_tag_id is not null then
        insert into public.memory_story_tags (story_id, tag_id) values (v_story_id, v_tag_id)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  v_audit_action := case v_story_status
    when 'approved' then 'admin_story_published'
    when 'draft' then 'admin_story_draft_created'
    else 'admin_story_created'
  end;

  perform public.create_memory_audit_log(
    p_memory_map_id, v_audit_action, 'story', v_story_id, null,
    jsonb_build_object(
      'title', trim(p_story_title),
      'status', v_story_status,
      'is_official', coalesce(p_is_official, false)
    ),
    null
  );

  return v_story_id;
end;
$$;
