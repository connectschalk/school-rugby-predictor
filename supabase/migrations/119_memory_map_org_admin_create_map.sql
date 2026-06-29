-- Organisation admins can create Memory Maps under their organisation.

create or replace function public.create_memory_map_for_organisation(
  p_organisation_id uuid,
  p_map_title text,
  p_map_slug text,
  p_tagline text default null,
  p_description text default null,
  p_visibility text default 'link_only',
  p_status text default 'draft',
  p_primary_color text default '#FFD400',
  p_accent_color text default '#FFD400'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_map_id uuid;
  v_map_slug text := lower(trim(regexp_replace(coalesce(p_map_slug, ''), '[^a-z0-9-]+', '-', 'g')));
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_organisation_admin(p_organisation_id, v_uid) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.organisations where id = p_organisation_id) then
    raise exception 'organisation not found';
  end if;
  if v_map_slug = '' then raise exception 'invalid slug'; end if;
  if p_map_title is null or trim(p_map_title) = '' then raise exception 'map title required'; end if;

  insert into public.memory_maps (
    organisation_id, title, slug, tagline, description,
    visibility, status, primary_color, accent_color, created_by
  ) values (
    p_organisation_id, trim(p_map_title), v_map_slug,
    nullif(trim(coalesce(p_tagline, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    coalesce(p_visibility, 'link_only'), coalesce(p_status, 'draft'),
    coalesce(nullif(trim(p_primary_color), ''), '#FFD400'),
    coalesce(nullif(trim(p_accent_color), ''), '#FFD400'),
    v_uid
  )
  returning id into v_map_id;

  insert into public.memory_categories (memory_map_id, name, icon, colour, sort_order) values
    (v_map_id, 'Sport', 'trophy', '#A855F7', 1),
    (v_map_id, 'History', 'landmark', '#3B82F6', 2),
    (v_map_id, 'Hostel', 'home', '#22C55E', 3),
    (v_map_id, 'Interviews', 'mic', '#EF4444', 4),
    (v_map_id, 'Events', 'calendar', '#F97316', 5),
    (v_map_id, 'Archive', 'archive', '#9CA3AF', 6);

  insert into public.memory_map_members (memory_map_id, user_id, role, status, approved_by, approved_at)
  values (v_map_id, v_uid, 'admin', 'approved', v_uid, now())
  on conflict (memory_map_id, user_id) do update
  set role = 'admin', status = 'approved', approved_by = v_uid, approved_at = now();

  perform public.create_memory_audit_log(
    v_map_id, 'map_created', 'map', v_map_id, null,
    jsonb_build_object('organisation_id', p_organisation_id, 'slug', v_map_slug), null
  );

  return v_map_id;
end;
$$;

revoke all on function public.create_memory_map_for_organisation(uuid, text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_memory_map_for_organisation(uuid, text, text, text, text, text, text, text, text) to authenticated;
