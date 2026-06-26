-- Memory Map Phase 4: pilot hardening — analytics, governance, platform create, areas, members, RLS.

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------

alter table public.memory_stories
  add column if not exists approval_note text;

alter table public.memory_areas
  add column if not exists area_group text
    check (area_group is null or area_group in ('outdoor', 'indoor', 'offsite', 'event'));

create table if not exists public.memory_map_events (
  id uuid primary key default gen_random_uuid(),
  memory_map_id uuid not null references public.memory_maps (id) on delete cascade,
  area_id uuid references public.memory_areas (id) on delete set null,
  pin_id uuid references public.memory_pins (id) on delete set null,
  story_id uuid references public.memory_stories (id) on delete set null,
  event_type text not null,
  anonymous_id text,
  user_id uuid references auth.users (id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists memory_map_events_map_idx on public.memory_map_events (memory_map_id);
create index if not exists memory_map_events_type_idx on public.memory_map_events (event_type);
create index if not exists memory_map_events_created_idx on public.memory_map_events (created_at desc);

alter table public.memory_map_events enable row level security;

-- ---------------------------------------------------------------------------
-- Visibility helpers
-- Security model:
-- - public/link_only active maps: anon + authenticated can read approved content via public policies.
-- - private active maps: only approved members/admins/platform admins (member select policies).
-- - Contributors submit via security definer RPCs; cannot self-approve.
-- - Map admins manage their map; platform admins manage all.
-- ---------------------------------------------------------------------------

create or replace function public.can_view_memory_map(p_map_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memory_maps mm
    where mm.id = p_map_id
      and mm.status = 'active'
      and (
        mm.visibility in ('public', 'link_only')
        or public.is_app_admin(p_user_id)
        or public.is_memory_map_admin(p_map_id, p_user_id)
        or exists (
          select 1 from public.memory_map_members m
          where m.memory_map_id = p_map_id
            and m.user_id = p_user_id
            and m.status = 'approved'
        )
      )
  );
$$;

-- Member/admin read for private maps
create policy memory_maps_member_select on public.memory_maps
for select using (
  status = 'active'
  and visibility = 'private'
  and (
    public.is_memory_map_admin(id, auth.uid())
    or exists (
      select 1 from public.memory_map_members m
      where m.memory_map_id = id
        and m.user_id = auth.uid()
        and m.status = 'approved'
    )
  )
);

-- Platform admins can read organisations
create policy organisations_app_admin_select on public.organisations
for select using (public.is_app_admin(auth.uid()));

-- Analytics: anyone can insert events (anon ok); admins read their map
create policy memory_map_events_insert on public.memory_map_events
for insert with check (true);

create policy memory_map_events_admin_select on public.memory_map_events
for select using (public.is_memory_map_admin(memory_map_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Track analytics event (callable by anon + authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.track_memory_map_event(
  p_memory_map_id uuid,
  p_event_type text,
  p_area_id uuid default null,
  p_pin_id uuid default null,
  p_story_id uuid default null,
  p_anonymous_id text default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.memory_map_events (
    memory_map_id, area_id, pin_id, story_id, event_type,
    anonymous_id, user_id, metadata
  ) values (
    p_memory_map_id, p_area_id, p_pin_id, p_story_id, p_event_type,
    nullif(trim(coalesce(p_anonymous_id, '')), ''),
    auth.uid(),
    p_metadata
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform admin: create organisation + memory map
-- ---------------------------------------------------------------------------

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

  -- Default categories
  insert into public.memory_categories (memory_map_id, name, icon, colour, sort_order) values
    (v_map_id, 'Sport', 'trophy', '#A855F7', 1),
    (v_map_id, 'History', 'landmark', '#3B82F6', 2),
    (v_map_id, 'Hostel', 'home', '#22C55E', 3),
    (v_map_id, 'Interviews', 'mic', '#EF4444', 4),
    (v_map_id, 'Events', 'calendar', '#F97316', 5),
    (v_map_id, 'Archive', 'archive', '#9CA3AF', 6);

  -- Creator becomes map admin
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

-- ---------------------------------------------------------------------------
-- Area create / update / archive
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
  p_is_active boolean default true
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
  if not public.is_memory_map_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'area name required'; end if;

  if p_area_id is null then
    insert into public.memory_areas (
      memory_map_id, name, description, area_group, map_type,
      centre_lat, centre_lng, geofence_polygon,
      map_image_url, image_width, image_height, sort_order, is_active
    ) values (
      p_map_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
      nullif(trim(coalesce(p_area_group, '')), ''), coalesce(p_map_type, 'geo'),
      p_centre_lat, p_centre_lng, p_geofence_polygon,
      nullif(trim(coalesce(p_map_image_url, '')), ''),
      p_image_width, p_image_height, coalesce(p_sort_order, 0), coalesce(p_is_active, true)
    )
    returning id into v_id;
    v_action := 'area_created';
  else
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

create or replace function public.archive_memory_area(p_area_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_map_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select memory_map_id into v_map_id from public.memory_areas where id = p_area_id;
  if not found then raise exception 'area not found'; end if;
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  update public.memory_areas set is_active = false, updated_at = now() where id = p_area_id;

  perform public.create_memory_audit_log(
    v_map_id, 'area_archived', 'area', p_area_id, null, null, null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Extended member management
-- ---------------------------------------------------------------------------

create or replace function public.manage_memory_map_member(
  p_member_id uuid,
  p_action text,
  p_reason text default null,
  p_new_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.memory_map_members;
  v_action text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_row from public.memory_map_members where id = p_member_id;
  if not found then raise exception 'member not found'; end if;
  if not public.is_memory_map_admin(v_row.memory_map_id, v_uid) then
    raise exception 'forbidden';
  end if;

  if p_action = 'approve' then
    update public.memory_map_members
    set status = 'approved', approved_by = v_uid, approved_at = now()
    where id = p_member_id;
    v_action := 'contributor_approved';
  elsif p_action = 'reject' then
    update public.memory_map_members set status = 'rejected' where id = p_member_id;
    v_action := 'contributor_rejected';
  elsif p_action = 'suspend' then
    update public.memory_map_members set status = 'suspended' where id = p_member_id;
    v_action := 'contributor_suspended';
  elsif p_action = 'reactivate' then
    update public.memory_map_members
    set status = 'approved', approved_by = v_uid, approved_at = now()
    where id = p_member_id;
    v_action := 'contributor_reactivated';
  elsif p_action = 'remove' then
    delete from public.memory_map_members where id = p_member_id;
    perform public.create_memory_audit_log(
      v_row.memory_map_id, 'member_removed', 'member', p_member_id,
      to_jsonb(v_row), null, p_reason
    );
    return;
  elsif p_action = 'change_role' then
    if p_new_role is null or p_new_role not in ('contributor', 'moderator', 'admin', 'viewer') then
      raise exception 'invalid role';
    end if;
    if p_new_role = 'admin' and not public.is_app_admin(v_uid) then
      raise exception 'only platform admin can assign map admin role';
    end if;
    update public.memory_map_members set role = p_new_role where id = p_member_id;
    v_action := 'member_role_changed';
  else
    raise exception 'invalid action';
  end if;

  perform public.create_memory_audit_log(
    v_row.memory_map_id, v_action, 'member', p_member_id,
    to_jsonb(v_row), jsonb_build_object('action', p_action, 'role', p_new_role), p_reason
  );
end;
$$;

-- Approve story with optional note
create or replace function public.approve_memory_story(
  p_story_id uuid,
  p_approval_note text default null
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
  v_pin public.memory_pins;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_story from public.memory_stories where id = p_story_id;
  if not found then raise exception 'story not found'; end if;
  if v_story.uploaded_by = v_uid then raise exception 'cannot approve own story'; end if;

  v_map_id := public.memory_map_id_for_pin(v_story.pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  update public.memory_stories
  set status = 'approved', approved_by = v_uid, approved_at = now(),
      approval_note = nullif(trim(coalesce(p_approval_note, '')), ''),
      updated_at = now()
  where id = p_story_id;

  select * into v_pin from public.memory_pins where id = v_story.pin_id;
  if v_pin.status = 'pending' then
    update public.memory_pins set status = 'approved', updated_by = v_uid, updated_at = now()
    where id = v_pin.id;
  end if;

  perform public.create_memory_audit_log(
    v_map_id, 'story_approved', 'story', p_story_id,
    to_jsonb(v_story), jsonb_build_object('status', 'approved', 'note', p_approval_note),
    p_approval_note
  );
end;
$$;

-- Analytics summary for admin
create or replace function public.memory_map_analytics_summary(p_map_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'landing_views', count(*) filter (where event_type = 'map_landing_viewed'),
    'map_opens', count(*) filter (where event_type = 'map_opened'),
    'story_opens', count(*) filter (where event_type = 'story_opened'),
    'pin_opens', count(*) filter (where event_type = 'pin_opened'),
    'contributor_requests', count(*) filter (where event_type = 'contributor_request_submitted'),
    'story_submissions', count(*) filter (where event_type = 'story_submitted')
  ) into v_result
  from public.memory_map_events
  where memory_map_id = p_map_id and created_at >= v_since;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.track_memory_map_event(uuid, text, uuid, uuid, uuid, text, jsonb) from public;
revoke all on function public.create_memory_map_platform(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.upsert_memory_area(uuid, uuid, text, text, text, text, double precision, double precision, jsonb, text, integer, integer, integer, boolean) from public;
revoke all on function public.archive_memory_area(uuid) from public;
revoke all on function public.manage_memory_map_member(uuid, text, text, text) from public;
revoke all on function public.memory_map_analytics_summary(uuid, integer) from public;
revoke all on function public.can_view_memory_map(uuid, uuid) from public;

grant execute on function public.track_memory_map_event(uuid, text, uuid, uuid, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.create_memory_map_platform(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.upsert_memory_area(uuid, uuid, text, text, text, text, double precision, double precision, jsonb, text, integer, integer, integer, boolean) to authenticated;
grant execute on function public.archive_memory_area(uuid) to authenticated;
grant execute on function public.manage_memory_map_member(uuid, text, text, text) to authenticated;
grant execute on function public.memory_map_analytics_summary(uuid, integer) to authenticated;
grant execute on function public.can_view_memory_map(uuid, uuid) to authenticated;
