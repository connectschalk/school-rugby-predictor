-- Memory Map default starting points for maps and areas.
--
-- memory_maps.default_lat/lng/zoom: fallback centre when an area has no centre.
-- memory_areas.centre_lat/lng + default_zoom: area-specific starting view (overrides map default).
-- Browser geolocation overrides both only when the user grants permission and is near the area.
-- memory_areas.default_x/y_position: default focus on uploaded school/indoor image maps.

alter table public.memory_maps
  add column if not exists default_lat double precision,
  add column if not exists default_lng double precision,
  add column if not exists default_zoom integer default 17;

alter table public.memory_areas
  add column if not exists default_zoom integer default 18,
  add column if not exists default_x_position double precision default 50,
  add column if not exists default_y_position double precision default 50,
  add column if not exists default_image_zoom double precision default 1;

-- Demo / Boishaai seed defaults (approximate Paarl Boys' High region)
update public.memory_maps
set
  default_lat = coalesce(default_lat, -33.9249),
  default_lng = coalesce(default_lng, 18.4241),
  default_zoom = coalesce(default_zoom, 17)
where slug = 'boishaai';

update public.memory_areas ma
set
  default_zoom = coalesce(ma.default_zoom, 18),
  default_x_position = coalesce(ma.default_x_position, 50),
  default_y_position = coalesce(ma.default_y_position, 50),
  default_image_zoom = coalesce(ma.default_image_zoom, 1),
  centre_lat = coalesce(ma.centre_lat, mm.default_lat),
  centre_lng = coalesce(ma.centre_lng, mm.default_lng)
from public.memory_maps mm
where ma.memory_map_id = mm.id
  and mm.slug = 'boishaai'
  and ma.map_type = 'geo'
  and ma.centre_lat is null;

update public.memory_areas ma
set
  default_zoom = coalesce(ma.default_zoom, 18),
  default_x_position = coalesce(ma.default_x_position, 50),
  default_y_position = coalesce(ma.default_y_position, 50)
from public.memory_maps mm
where ma.memory_map_id = mm.id
  and mm.slug = 'boishaai'
  and ma.map_type = 'image';

-- Focus rugby field tighter than campus default
update public.memory_areas ma
set centre_lat = -33.9255, centre_lng = 18.425, default_zoom = 18
from public.memory_maps mm
where ma.memory_map_id = mm.id and mm.slug = 'boishaai' and ma.name = 'Main Rugby Field';

-- ---------------------------------------------------------------------------
-- Memory Map default start point
-- ---------------------------------------------------------------------------

create or replace function public.update_memory_map_start_point(
  p_map_id uuid,
  p_default_lat double precision default null,
  p_default_lng double precision default null,
  p_default_zoom integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'default_lat', default_lat,
    'default_lng', default_lng,
    'default_zoom', default_zoom
  ) into v_old
  from public.memory_maps where id = p_map_id;

  update public.memory_maps
  set
    default_lat = p_default_lat,
    default_lng = p_default_lng,
    default_zoom = coalesce(p_default_zoom, default_zoom, 17),
    updated_at = now()
  where id = p_map_id;

  perform public.create_memory_audit_log(
    p_map_id, 'memory_map_start_point_updated', 'map', p_map_id, v_old,
    jsonb_build_object(
      'default_lat', p_default_lat,
      'default_lng', p_default_lng,
      'default_zoom', coalesce(p_default_zoom, 17)
    ),
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Area upsert — include start point fields
-- ---------------------------------------------------------------------------

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
  p_default_image_zoom double precision default null
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
  v_old_start jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'area name required'; end if;

  if p_area_id is null then
    insert into public.memory_areas (
      memory_map_id, name, description, area_group, map_type,
      centre_lat, centre_lng, geofence_polygon,
      map_image_url, image_width, image_height, sort_order, is_active,
      default_zoom, default_x_position, default_y_position, default_image_zoom
    ) values (
      p_map_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
      nullif(trim(coalesce(p_area_group, '')), ''), coalesce(p_map_type, 'geo'),
      p_centre_lat, p_centre_lng, p_geofence_polygon,
      nullif(trim(coalesce(p_map_image_url, '')), ''),
      p_image_width, p_image_height, coalesce(p_sort_order, 0), coalesce(p_is_active, true),
      coalesce(p_default_zoom, 18), coalesce(p_default_x_position, 50),
      coalesce(p_default_y_position, 50), coalesce(p_default_image_zoom, 1)
    )
    returning id into v_id;
    v_action := 'area_created';
  else
    select jsonb_build_object(
      'centre_lat', centre_lat, 'centre_lng', centre_lng,
      'default_zoom', default_zoom,
      'default_x_position', default_x_position,
      'default_y_position', default_y_position
    ) into v_old_start
    from public.memory_areas where id = p_area_id;

    update public.memory_areas set
      name = trim(p_name),
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
      updated_at = now()
    where id = p_area_id and memory_map_id = p_map_id
    returning id into v_id;
    if v_id is null then raise exception 'area not found'; end if;
    v_action := 'area_updated';

    perform public.create_memory_audit_log(
      p_map_id, 'area_start_point_updated', 'area', v_id, v_old_start,
      jsonb_build_object(
        'centre_lat', p_centre_lat,
        'centre_lng', p_centre_lng,
        'default_zoom', p_default_zoom,
        'default_x_position', p_default_x_position,
        'default_y_position', p_default_y_position
      ),
      null
    );
  end if;

  perform public.create_memory_audit_log(
    p_map_id, v_action, 'area', v_id, null,
    jsonb_build_object('name', trim(p_name)), null
  );
  return v_id;
end;
$$;

revoke all on function public.update_memory_map_start_point(uuid, double precision, double precision, integer) from public;
grant execute on function public.update_memory_map_start_point(uuid, double precision, double precision, integer) to authenticated;

revoke all on function public.upsert_memory_area(uuid, uuid, text, text, text, text, double precision, double precision, jsonb, text, integer, integer, integer, boolean, integer, double precision, double precision, double precision) from public;
grant execute on function public.upsert_memory_area(uuid, uuid, text, text, text, text, double precision, double precision, jsonb, text, integer, integer, integer, boolean, integer, double precision, double precision, double precision) to authenticated;
