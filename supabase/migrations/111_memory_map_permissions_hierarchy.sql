-- Memory Map permissions hierarchy:
-- Platform Admin (is_app_admin) > Organisation Admin > Map Admin > Moderator > Contributor > Viewer

-- ---------------------------------------------------------------------------
-- Organisation membership
-- ---------------------------------------------------------------------------

create table if not exists public.organisation_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'admin'
    check (role in ('admin', 'moderator', 'viewer')),
  status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);

create index if not exists organisation_members_org_idx on public.organisation_members (organisation_id);
create index if not exists organisation_members_user_idx on public.organisation_members (user_id);

-- ---------------------------------------------------------------------------
-- Permission helpers (must exist before RLS policies reference them)
-- ---------------------------------------------------------------------------

create or replace function public.organisation_id_for_map(p_map_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select mm.organisation_id from public.memory_maps mm where mm.id = p_map_id limit 1;
$$;

create or replace function public.is_organisation_admin(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_app_admin(p_user_id)
    or exists (
      select 1
      from public.organisation_members om
      where om.organisation_id = p_org_id
        and om.user_id = p_user_id
        and om.status = 'approved'
        and om.role = 'admin'
    );
$$;

create or replace function public.is_memory_map_moderator(p_map_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memory_map_members m
    where m.memory_map_id = p_map_id
      and m.user_id = p_user_id
      and m.status = 'approved'
      and m.role = 'moderator'
  );
$$;

create or replace function public.is_memory_map_settings_admin(p_map_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_app_admin(p_user_id)
    or public.is_organisation_admin(public.organisation_id_for_map(p_map_id), p_user_id)
    or exists (
      select 1
      from public.memory_map_members m
      where m.memory_map_id = p_map_id
        and m.user_id = p_user_id
        and m.status = 'approved'
        and m.role = 'admin'
    )
    or exists (
      select 1
      from public.memory_maps mm
      where mm.id = p_map_id
        and mm.created_by = p_user_id
    );
$$;

-- Content moderation: settings admin OR map moderator
create or replace function public.is_memory_map_admin(p_map_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_memory_map_settings_admin(p_map_id, p_user_id)
    or public.is_memory_map_moderator(p_map_id, p_user_id);
$$;

alter table public.organisation_members enable row level security;

create policy organisation_members_self_select on public.organisation_members
for select using (
  user_id = auth.uid()
  or public.is_app_admin(auth.uid())
  or public.is_organisation_admin(organisation_id, auth.uid())
);

-- ---------------------------------------------------------------------------
-- RLS: organisations + settings-scoped tables
-- ---------------------------------------------------------------------------

drop policy if exists organisations_app_admin_select on public.organisations;
create policy organisations_admin_select on public.organisations
for select using (
  public.is_app_admin(auth.uid())
  or public.is_organisation_admin(id, auth.uid())
  or exists (
    select 1 from public.memory_maps mm
    where mm.organisation_id = organisations.id
      and mm.status = 'active'
      and mm.visibility in ('public', 'link_only')
  )
);

drop policy if exists memory_maps_admin_all on public.memory_maps;
create policy memory_maps_admin_all on public.memory_maps
for all using (public.is_memory_map_settings_admin(id, auth.uid()))
with check (public.is_memory_map_settings_admin(id, auth.uid()));

drop policy if exists memory_areas_admin_all on public.memory_areas;
create policy memory_areas_admin_all on public.memory_areas
for all using (public.is_memory_map_settings_admin(memory_map_id, auth.uid()))
with check (public.is_memory_map_settings_admin(memory_map_id, auth.uid()));

drop policy if exists memory_categories_admin_all on public.memory_categories;
create policy memory_categories_admin_all on public.memory_categories
for all using (public.is_memory_map_settings_admin(memory_map_id, auth.uid()))
with check (public.is_memory_map_settings_admin(memory_map_id, auth.uid()));

drop policy if exists memory_map_members_admin_update on public.memory_map_members;
create policy memory_map_members_admin_update on public.memory_map_members
for update using (public.is_memory_map_settings_admin(memory_map_id, auth.uid()));

drop policy if exists memory_map_invites_admin_select on public.memory_map_invites;
create policy memory_map_invites_admin_select on public.memory_map_invites
for select using (public.is_memory_map_settings_admin(memory_map_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Platform admin: manage organisation admins
-- ---------------------------------------------------------------------------

create or replace function public.manage_organisation_member(
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
  v_row public.organisation_members;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_app_admin(v_uid) then raise exception 'forbidden'; end if;

  select * into v_row from public.organisation_members where id = p_member_id;
  if not found then raise exception 'member not found'; end if;

  if p_action = 'approve' then
    update public.organisation_members
    set status = 'approved', approved_by = v_uid, approved_at = now()
    where id = p_member_id;
  elsif p_action = 'reject' then
    update public.organisation_members set status = 'rejected' where id = p_member_id;
  elsif p_action = 'suspend' then
    update public.organisation_members set status = 'suspended' where id = p_member_id;
  elsif p_action = 'reactivate' then
    update public.organisation_members
    set status = 'approved', approved_by = v_uid, approved_at = now()
    where id = p_member_id;
  elsif p_action = 'remove' then
    delete from public.organisation_members where id = p_member_id;
    return;
  elsif p_action = 'change_role' then
    if p_new_role is null or p_new_role not in ('admin', 'moderator', 'viewer') then
      raise exception 'invalid role';
    end if;
    update public.organisation_members set role = p_new_role where id = p_member_id;
  else
    raise exception 'invalid action';
  end if;
end;
$$;

create or replace function public.assign_organisation_admin(
  p_organisation_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_app_admin(v_uid) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.organisations where id = p_organisation_id) then
    raise exception 'organisation not found';
  end if;

  insert into public.organisation_members (organisation_id, user_id, role, status, approved_by, approved_at)
  values (p_organisation_id, p_user_id, 'admin', 'approved', v_uid, now())
  on conflict (organisation_id, user_id) do update
  set role = 'admin', status = 'approved', approved_by = v_uid, approved_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin index: list maps accessible to current user
-- ---------------------------------------------------------------------------

create or replace function public.list_accessible_memory_maps()
returns table (
  map_id uuid,
  map_slug text,
  map_title text,
  map_status text,
  organisation_id uuid,
  organisation_name text,
  organisation_slug text,
  access_level text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  if public.is_app_admin(v_uid) then
    return query
    select
      mm.id, mm.slug, mm.title, mm.status,
      o.id, o.name, o.slug,
      'platform'::text
    from public.memory_maps mm
    join public.organisations o on o.id = mm.organisation_id
    order by mm.title;
    return;
  end if;

  return query
  select distinct on (mm.id)
    mm.id, mm.slug, mm.title, mm.status,
    o.id, o.name, o.slug,
    case
      when public.is_organisation_admin(o.id, v_uid) then 'organisation'
      when m.role = 'admin' then 'map_admin'
      when m.role = 'moderator' then 'moderator'
      else 'map_admin'
    end
  from public.memory_maps mm
  join public.organisations o on o.id = mm.organisation_id
  left join public.memory_map_members m
    on m.memory_map_id = mm.id and m.user_id = v_uid and m.status = 'approved'
  where
    public.is_organisation_admin(o.id, v_uid)
    or (m.id is not null and m.role in ('admin', 'moderator'))
    or mm.created_by = v_uid
  order by mm.id, mm.title;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings RPCs: restrict moderators
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
  if not public.is_memory_map_settings_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;
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
  if not public.is_memory_map_settings_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  update public.memory_areas set is_active = false, updated_at = now() where id = p_area_id;

  perform public.create_memory_audit_log(
    v_map_id, 'area_archived', 'area', p_area_id, null, null, null
  );
end;
$$;

create or replace function public.update_memory_map_branding(
  p_map_id uuid,
  p_title text,
  p_tagline text,
  p_profile_image_url text,
  p_landing_background_url text,
  p_primary_color text,
  p_primary_text_color text,
  p_secondary_color text,
  p_secondary_text_color text,
  p_accent_color text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.memory_maps;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_settings_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;

  select * into v_old from public.memory_maps where id = p_map_id;

  update public.memory_maps
  set
    title = coalesce(nullif(trim(p_title), ''), title),
    tagline = nullif(trim(coalesce(p_tagline, '')), ''),
    profile_image_url = nullif(trim(coalesce(p_profile_image_url, '')), ''),
    landing_background_url = nullif(trim(coalesce(p_landing_background_url, '')), ''),
    primary_color = coalesce(nullif(trim(p_primary_color), ''), primary_color),
    primary_text_color = coalesce(nullif(trim(p_primary_text_color), ''), primary_text_color),
    secondary_color = coalesce(nullif(trim(p_secondary_color), ''), secondary_color),
    secondary_text_color = coalesce(nullif(trim(p_secondary_text_color), ''), secondary_text_color),
    accent_color = coalesce(nullif(trim(p_accent_color), ''), accent_color),
    updated_at = now()
  where id = p_map_id;

  perform public.create_memory_audit_log(
    p_map_id, 'branding_updated', 'map', p_map_id, to_jsonb(v_old), null, null
  );
end;
$$;

create or replace function public.update_memory_map_sponsor(
  p_map_id uuid,
  p_sponsor_name text,
  p_sponsor_logo_url text,
  p_sponsor_website_url text,
  p_sponsor_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.memory_maps;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_settings_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;

  select * into v_old from public.memory_maps where id = p_map_id;

  update public.memory_maps
  set
    sponsor_name = nullif(trim(coalesce(p_sponsor_name, '')), ''),
    sponsor_logo_url = nullif(trim(coalesce(p_sponsor_logo_url, '')), ''),
    sponsor_website_url = nullif(trim(coalesce(p_sponsor_website_url, '')), ''),
    sponsor_message = nullif(trim(coalesce(p_sponsor_message, '')), ''),
    updated_at = now()
  where id = p_map_id;

  perform public.create_memory_audit_log(
    p_map_id, 'sponsor_updated', 'map', p_map_id, to_jsonb(v_old), null, null
  );
end;
$$;

create or replace function public.create_memory_map_invite(
  p_map_id uuid,
  p_role text default 'contributor',
  p_auto_approve boolean default false,
  p_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_settings_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;
  if p_role not in ('contributor', 'moderator', 'viewer') then raise exception 'invalid role'; end if;

  v_token := encode(gen_random_bytes(16), 'hex');

  insert into public.memory_map_invites (
    memory_map_id, invite_token, role, auto_approve, expires_at, created_by
  ) values (
    p_map_id, v_token, p_role, coalesce(p_auto_approve, false), p_expires_at, v_uid
  );

  perform public.create_memory_audit_log(
    p_map_id, 'invite_created', 'invite', null, null,
    jsonb_build_object('role', p_role, 'auto_approve', p_auto_approve), null
  );

  return v_token;
end;
$$;

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
  v_map_id uuid;
  v_org_id uuid;
  v_action text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_row from public.memory_map_members where id = p_member_id;
  if not found then raise exception 'member not found'; end if;

  v_map_id := v_row.memory_map_id;
  v_org_id := public.organisation_id_for_map(v_map_id);

  if not public.is_memory_map_settings_admin(v_map_id, v_uid) then
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
      v_map_id, 'member_removed', 'member', p_member_id,
      to_jsonb(v_row), null, p_reason
    );
    return;
  elsif p_action = 'change_role' then
    if p_new_role is null or p_new_role not in ('contributor', 'moderator', 'admin', 'viewer') then
      raise exception 'invalid role';
    end if;
    if p_new_role = 'admin'
       and not (
         public.is_app_admin(v_uid)
         or public.is_organisation_admin(v_org_id, v_uid)
       ) then
      raise exception 'only platform or organisation admin can assign map admin role';
    end if;
    update public.memory_map_members set role = p_new_role where id = p_member_id;
    v_action := 'member_role_changed';
  else
    raise exception 'invalid action';
  end if;

  perform public.create_memory_audit_log(
    v_map_id, v_action, 'member', p_member_id,
    to_jsonb(v_row), jsonb_build_object('action', p_action, 'role', p_new_role), p_reason
  );
end;
$$;

-- Platform create remains platform-admin only; seed org admin membership for creator when desired later.
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
    jsonb_build_object('org_id', v_org_id, 'slug', v_map_slug), null
  );

  return v_map_id;
end;
$$;

-- Grants
revoke all on function public.organisation_id_for_map(uuid) from public;
revoke all on function public.is_organisation_admin(uuid, uuid) from public;
revoke all on function public.is_memory_map_moderator(uuid, uuid) from public;
revoke all on function public.is_memory_map_settings_admin(uuid, uuid) from public;
grant execute on function public.organisation_id_for_map(uuid) to authenticated;
grant execute on function public.is_organisation_admin(uuid, uuid) to authenticated;
grant execute on function public.is_memory_map_moderator(uuid, uuid) to authenticated;
grant execute on function public.is_memory_map_settings_admin(uuid, uuid) to authenticated;
grant execute on function public.manage_organisation_member(uuid, text, text, text) to authenticated;
grant execute on function public.assign_organisation_admin(uuid, uuid) to authenticated;
grant execute on function public.list_accessible_memory_maps() to authenticated;

notify pgrst, 'reload schema';
