-- Admin add content: story flags + admin_create_memory_story RPC.

alter table public.memory_stories
  add column if not exists is_official boolean not null default false;

alter table public.memory_stories
  add column if not exists governance_flags jsonb not null default '{}'::jsonb;

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
  if trim(coalesce(p_story_description, '')) = '' then raise exception 'description required'; end if;
  if p_event_year is null or p_event_year < 1800 or p_event_year > 2100 then
    raise exception 'valid event year required';
  end if;

  select * into v_area from public.memory_areas
  where id = p_area_id and memory_map_id = p_memory_map_id and is_active = true;
  if not found then raise exception 'invalid area'; end if;

  v_pin_category := coalesce(p_pin_category_id, p_category_id);
  if v_pin_category is null then raise exception 'category required'; end if;

  select colour into v_cat_colour from public.memory_categories
  where id = v_pin_category and memory_map_id = p_memory_map_id;

  v_flags := coalesce(p_governance_flags, '{}'::jsonb)
    || jsonb_build_object('admin_created', true);

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
    for v_media in select * from jsonb_array_elements(p_media)
    loop
      insert into public.memory_story_media (
        story_id, media_type, file_url, thumbnail_url, file_name, file_size, mime_type, sort_order
      ) values (
        v_story_id,
        coalesce(v_media->>'media_type', 'image'),
        v_media->>'file_url',
        v_media->>'thumbnail_url',
        v_media->>'file_name',
        nullif(v_media->>'file_size', '')::integer,
        v_media->>'mime_type',
        coalesce((v_media->>'sort_order')::integer, v_sort)
      );
      v_sort := v_sort + 1;
    end loop;
  end if;

  if p_tags is not null then
    foreach v_tag in array p_tags
    loop
      v_tag := lower(trim(v_tag));
      if v_tag = '' then continue; end if;
      insert into public.memory_tags (memory_map_id, name)
      values (p_memory_map_id, v_tag)
      on conflict (memory_map_id, name) do nothing;
      select id into v_tag_id from public.memory_tags
      where memory_map_id = p_memory_map_id and name = v_tag;
      if v_tag_id is not null then
        insert into public.memory_story_tags (story_id, tag_id)
        values (v_story_id, v_tag_id)
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

revoke all on function public.admin_create_memory_story(
  uuid, uuid, uuid, boolean, text, text, uuid,
  double precision, double precision, double precision, double precision,
  text, text, integer, date, uuid, text[], text, text, text, text,
  boolean, boolean, text, jsonb, jsonb
) from public;

grant execute on function public.admin_create_memory_story(
  uuid, uuid, uuid, boolean, text, text, uuid,
  double precision, double precision, double precision, double precision,
  text, text, integer, date, uuid, text[], text, text, text, text,
  boolean, boolean, text, jsonb, jsonb
) to authenticated;
