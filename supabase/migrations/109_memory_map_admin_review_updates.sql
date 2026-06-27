-- Admin review: update pending stories/pins before approval.

create or replace function public.admin_update_memory_story(
  p_story_id uuid,
  p_title text default null,
  p_description text default null,
  p_event_year integer default null,
  p_event_date date default null,
  p_logged_by_display_name text default null,
  p_risk_level text default null,
  p_governance_flags jsonb default null,
  p_tags text[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_story public.memory_stories;
  v_map_id uuid;
  v_tag text;
  v_tag_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_story from public.memory_stories where id = p_story_id;
  if not found then raise exception 'story not found'; end if;

  v_map_id := public.memory_map_id_for_pin(v_story.pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  v_old := to_jsonb(v_story);

  update public.memory_stories
  set
    title = coalesce(nullif(trim(p_title), ''), title),
    description = case when p_description is null then description else nullif(trim(p_description), '') end,
    event_year = coalesce(p_event_year, event_year),
    event_date = coalesce(p_event_date, event_date),
    logged_by_display_name = coalesce(nullif(trim(p_logged_by_display_name), ''), logged_by_display_name),
    risk_level = coalesce(nullif(trim(p_risk_level), ''), risk_level),
    governance_flags = coalesce(p_governance_flags, governance_flags),
    updated_at = now()
  where id = p_story_id;

  if p_tags is not null then
    delete from public.memory_story_tags where story_id = p_story_id;
    foreach v_tag in array p_tags loop
      v_tag := lower(trim(v_tag));
      if v_tag = '' then continue; end if;
      insert into public.memory_tags (memory_map_id, name) values (v_map_id, v_tag)
      on conflict (memory_map_id, name) do nothing;
      select id into v_tag_id from public.memory_tags
      where memory_map_id = v_map_id and name = v_tag;
      if v_tag_id is not null then
        insert into public.memory_story_tags (story_id, tag_id) values (p_story_id, v_tag_id)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  select to_jsonb(s) into v_new from public.memory_stories s where s.id = p_story_id;

  perform public.create_memory_audit_log(
    v_map_id,
    case when v_story.status in ('pending_review', 'draft') then 'story_updated_before_approval' else 'story_updated' end,
    'story',
    p_story_id,
    v_old,
    v_new,
    null
  );
end;
$$;

create or replace function public.admin_update_memory_pin(
  p_pin_id uuid,
  p_title text default null,
  p_description text default null,
  p_category_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_x_position double precision default null,
  p_y_position double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pin public.memory_pins;
  v_map_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_cat_colour text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_pin from public.memory_pins where id = p_pin_id;
  if not found then raise exception 'pin not found'; end if;

  v_map_id := public.memory_map_id_for_pin(p_pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  v_old := to_jsonb(v_pin);

  if p_category_id is not null then
    select colour into v_cat_colour from public.memory_categories
    where id = p_category_id and memory_map_id = v_map_id;
  end if;

  update public.memory_pins
  set
    title = coalesce(nullif(trim(p_title), ''), title),
    description = case when p_description is null then description else nullif(trim(p_description), '') end,
    category_id = coalesce(p_category_id, category_id),
    colour = coalesce(v_cat_colour, colour),
    lat = coalesce(p_lat, lat),
    lng = coalesce(p_lng, lng),
    x_position = coalesce(p_x_position, x_position),
    y_position = coalesce(p_y_position, y_position),
    updated_by = v_uid,
    updated_at = now()
  where id = p_pin_id;

  select to_jsonb(p) into v_new from public.memory_pins p where p.id = p_pin_id;

  perform public.create_memory_audit_log(
    v_map_id,
    case when exists (
      select 1 from public.memory_stories s
      where s.pin_id = p_pin_id and s.status in ('pending_review', 'draft')
    ) then 'pin_updated_before_approval' else 'pin_updated' end,
    'pin',
    p_pin_id,
    v_old,
    v_new,
    null
  );
end;
$$;

-- Location-only pin update audit name when pending stories exist.
create or replace function public.move_memory_pin(
  p_pin_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_x double precision default null,
  p_y double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_map_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_pending boolean;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  v_map_id := public.memory_map_id_for_pin(p_pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  select to_jsonb(p) into v_old from public.memory_pins p where p.id = p_pin_id;
  if v_old is null then raise exception 'pin not found'; end if;

  select exists (
    select 1 from public.memory_stories s
    where s.pin_id = p_pin_id and s.status in ('pending_review', 'draft')
  ) into v_pending;

  update public.memory_pins
  set
    lat = coalesce(p_lat, lat),
    lng = coalesce(p_lng, lng),
    x_position = coalesce(p_x, x_position),
    y_position = coalesce(p_y, y_position),
    updated_by = v_uid,
    updated_at = now()
  where id = p_pin_id
  returning jsonb_build_object('lat', lat, 'lng', lng, 'x', x_position, 'y', y_position) into v_new;

  perform public.create_memory_audit_log(
    v_map_id,
    case when v_pending then 'story_location_updated_before_approval' else 'pin_moved' end,
    'pin',
    p_pin_id,
    v_old,
    v_new,
    null
  );
end;
$$;

create or replace function public.move_memory_story(
  p_story_id uuid,
  p_destination_pin_id uuid,
  p_new_pin jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_story public.memory_stories;
  v_map_id uuid;
  v_new_pin_id uuid;
  v_action text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_story from public.memory_stories where id = p_story_id;
  if not found then raise exception 'story not found'; end if;
  v_map_id := public.memory_map_id_for_pin(v_story.pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  if p_destination_pin_id is not null then
    v_new_pin_id := p_destination_pin_id;
  elsif p_new_pin is not null then
    insert into public.memory_pins (
      area_id, category_id, title, description, lat, lng, x_position, y_position,
      status, colour, created_by, updated_by
    ) values (
      (p_new_pin->>'area_id')::uuid,
      nullif(p_new_pin->>'category_id', '')::uuid,
      p_new_pin->>'title',
      p_new_pin->>'description',
      nullif(p_new_pin->>'lat', '')::double precision,
      nullif(p_new_pin->>'lng', '')::double precision,
      nullif(p_new_pin->>'x', '')::double precision,
      nullif(p_new_pin->>'y', '')::double precision,
      coalesce(p_new_pin->>'status', 'pending'),
      coalesce(p_new_pin->>'colour', '#FFD400'),
      v_uid, v_uid
    )
    returning id into v_new_pin_id;
    perform public.create_memory_audit_log(
      v_map_id, 'pin_created', 'pin', v_new_pin_id, null, p_new_pin, 'created for story move'
    );
  else
    raise exception 'destination pin required';
  end if;

  update public.memory_stories
  set pin_id = v_new_pin_id, previous_pin_id = v_story.pin_id,
      moved_by = v_uid, moved_at = now(), updated_at = now()
  where id = p_story_id;

  v_action := case
    when v_story.status in ('pending_review', 'draft') then 'story_moved_before_approval'
    else 'story_moved'
  end;

  perform public.create_memory_audit_log(
    v_map_id, v_action, 'story', p_story_id,
    jsonb_build_object('pin_id', v_story.pin_id),
    jsonb_build_object('pin_id', v_new_pin_id), null
  );
end;
$$;

revoke all on function public.admin_update_memory_story(
  uuid, text, text, integer, date, text, text, jsonb, text[]
) from public;
grant execute on function public.admin_update_memory_story(
  uuid, text, text, integer, date, text, text, jsonb, text[]
) to authenticated;

revoke all on function public.admin_update_memory_pin(
  uuid, text, text, uuid, double precision, double precision, double precision, double precision
) from public;
grant execute on function public.admin_update_memory_pin(
  uuid, text, text, uuid, double precision, double precision, double precision, double precision
) to authenticated;

notify pgrst, 'reload schema';
