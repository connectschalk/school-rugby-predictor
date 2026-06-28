-- Default General area + map-drawn area bounds for Memory Map.

alter table public.memory_areas
  add column if not exists is_system_default boolean not null default false,
  add column if not exists bounds jsonb default null,
  add column if not exists created_from text default null;

create unique index if not exists memory_areas_one_system_default_per_map
  on public.memory_areas (memory_map_id)
  where is_system_default = true and is_active = true;

-- Ensure a General system area exists for content before custom areas are created.
create or replace function public.ensure_default_memory_area(p_memory_map_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_area_id uuid;
  v_map public.memory_maps;
  v_lat double precision;
  v_lng double precision;
  v_zoom integer;
begin
  select * into v_map from public.memory_maps where id = p_memory_map_id;
  if not found then raise exception 'map not found'; end if;

  if not public.memory_map_is_publicly_viewable(p_memory_map_id)
     and (
       v_uid is null
       or not exists (
         select 1 from public.memory_map_members m
         where m.memory_map_id = p_memory_map_id
           and m.user_id = v_uid
           and m.status = 'approved'
       )
     )
     and (v_uid is null or not public.is_memory_map_settings_admin(p_memory_map_id, v_uid))
  then
    raise exception 'forbidden';
  end if;

  select id into v_area_id
  from public.memory_areas
  where memory_map_id = p_memory_map_id
    and is_system_default = true
    and is_active = true
  limit 1;

  if v_area_id is not null then
    return v_area_id;
  end if;

  v_lat := v_map.default_lat;
  v_lng := v_map.default_lng;
  v_zoom := coalesce(v_map.default_zoom, 17);

  insert into public.memory_areas (
    memory_map_id, name, description, map_type,
    centre_lat, centre_lng, default_zoom,
    sort_order, is_active, is_system_default, created_from
  ) values (
    p_memory_map_id,
    'General',
    'Default area for memories before they are organised.',
    'geo',
    v_lat,
    v_lng,
    v_zoom,
    -1,
    true,
    true,
    'system'
  )
  returning id into v_area_id;

  return v_area_id;
end;
$$;

grant execute on function public.ensure_default_memory_area(uuid) to anon, authenticated;

-- Block archiving the system default area.
create or replace function public.archive_memory_area(p_area_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_map_id uuid;
  v_is_system boolean;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select memory_map_id, is_system_default into v_map_id, v_is_system
  from public.memory_areas where id = p_area_id;
  if not found then raise exception 'area not found'; end if;
  if coalesce(v_is_system, false) then raise exception 'cannot archive system default area'; end if;
  if not public.is_memory_map_settings_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  update public.memory_areas set is_active = false, updated_at = now() where id = p_area_id;

  perform public.create_memory_audit_log(
    v_map_id, 'area_archived', 'area', p_area_id, null, null, null
  );
end;
$$;

-- Area upsert with bounds, system flag, and default zoom fields restored.
create or replace function public.upsert_memory_area(
  p_map_id uuid,
  p_area_id uuid default null,
  p_name text default null,
  p_description text default null,
  p_area_group text default null,
  p_map_type text default 'geo',
  p_centre_lat double precision default null,
  p_centre_lng double precision default null,
  p_geofence_polygon jsonb default null,
  p_map_image_url text default null,
  p_image_width integer default null,
  p_image_height integer default null,
  p_sort_order integer default 0,
  p_is_active boolean default true,
  p_default_zoom integer default null,
  p_default_x_position double precision default null,
  p_default_y_position double precision default null,
  p_default_image_zoom double precision default null,
  p_bounds jsonb default null,
  p_is_system_default boolean default false,
  p_created_from text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_action text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_settings_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'area name required'; end if;
  if coalesce(p_is_system_default, false) and p_area_id is null then
    raise exception 'system default areas are created automatically';
  end if;

  if p_area_id is null then
    insert into public.memory_areas (
      memory_map_id, name, description, area_group, map_type,
      centre_lat, centre_lng, geofence_polygon,
      map_image_url, image_width, image_height, sort_order, is_active,
      default_zoom, default_x_position, default_y_position, default_image_zoom,
      bounds, is_system_default, created_from
    ) values (
      p_map_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
      nullif(trim(coalesce(p_area_group, '')), ''), coalesce(p_map_type, 'geo'),
      p_centre_lat, p_centre_lng, p_geofence_polygon,
      nullif(trim(coalesce(p_map_image_url, '')), ''),
      p_image_width, p_image_height, coalesce(p_sort_order, 0), coalesce(p_is_active, true),
      coalesce(p_default_zoom, 18), coalesce(p_default_x_position, 50),
      coalesce(p_default_y_position, 50), coalesce(p_default_image_zoom, 1),
      p_bounds, coalesce(p_is_system_default, false), nullif(trim(coalesce(p_created_from, '')), '')
    )
    returning id into v_id;
    v_action := 'area_created';
  else
    update public.memory_areas set
      name = case when is_system_default then name else trim(p_name) end,
      description = nullif(trim(coalesce(p_description, '')), ''),
      area_group = nullif(trim(coalesce(p_area_group, '')), ''),
      map_type = coalesce(p_map_type, map_type),
      centre_lat = p_centre_lat,
      centre_lng = p_centre_lng,
      geofence_polygon = coalesce(p_geofence_polygon, geofence_polygon),
      map_image_url = nullif(trim(coalesce(p_map_image_url, '')), ''),
      image_width = coalesce(p_image_width, image_width),
      image_height = coalesce(p_image_height, image_height),
      sort_order = coalesce(p_sort_order, sort_order),
      is_active = coalesce(p_is_active, is_active),
      default_zoom = coalesce(p_default_zoom, default_zoom),
      default_x_position = coalesce(p_default_x_position, default_x_position),
      default_y_position = coalesce(p_default_y_position, default_y_position),
      default_image_zoom = coalesce(p_default_image_zoom, default_image_zoom),
      bounds = coalesce(p_bounds, bounds),
      created_from = coalesce(nullif(trim(coalesce(p_created_from, '')), ''), created_from),
      updated_at = now()
    where id = p_area_id and memory_map_id = p_map_id
    returning id into v_id;
    if v_id is null then raise exception 'area not found'; end if;
    v_action := 'area_updated';
  end if;

  perform public.create_memory_audit_log(
    p_map_id, v_action, 'area', v_id, null,
    jsonb_build_object('name', trim(p_name)), null
  );
  return v_id;
end;
$$;
