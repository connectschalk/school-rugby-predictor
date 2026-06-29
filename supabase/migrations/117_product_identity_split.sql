-- Product-scoped identity: predictor_profiles, memory_map_profiles, user_product_roles.
-- One Supabase Auth user; separate product profiles and platform admin scopes.

-- ---------------------------------------------------------------------------
-- Product platform roles
-- ---------------------------------------------------------------------------

create table if not exists public.user_product_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_key text not null check (product_key in ('predictor', 'memory_map', 'global')),
  role text not null check (role in ('platform_admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, product_key, role)
);

create index if not exists user_product_roles_user_idx on public.user_product_roles (user_id);

comment on table public.user_product_roles is
  'Platform-level admin per product. global = both products. Does not replace organisation_members / memory_map_members.';

-- Legacy user_profiles.role = admin becomes global platform admin (preserves existing operator access).
insert into public.user_product_roles (user_id, product_key, role)
select up.id, 'global', 'platform_admin'
from public.user_profiles up
where up.role = 'admin'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Predictor profile (display, avatar, onboarding)
-- ---------------------------------------------------------------------------

create table if not exists public.predictor_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  username text,
  first_name text,
  surname text,
  avatar_url text,
  avatar_letter text,
  avatar_colour text,
  onboarding_completed_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint predictor_profiles_username_key unique (username)
);

create index if not exists predictor_profiles_display_name_idx on public.predictor_profiles (display_name);

insert into public.predictor_profiles (
  user_id, display_name, first_name, surname, avatar_url, avatar_letter, avatar_colour
)
select
  up.id,
  up.display_name,
  up.first_name,
  up.surname,
  up.avatar_url,
  up.avatar_letter,
  up.avatar_colour
from public.user_profiles up
on conflict (user_id) do nothing;

-- Keep user_profiles in sync for leaderboard SQL (legacy read path).
create or replace function public.sync_predictor_profile_to_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (
    id, display_name, first_name, surname, avatar_url, avatar_letter, avatar_colour, role
  )
  values (
    new.user_id,
    new.display_name,
    new.first_name,
    new.surname,
    new.avatar_url,
    new.avatar_letter,
    new.avatar_colour,
    coalesce((select role from public.user_profiles where id = new.user_id), 'user')
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    first_name = excluded.first_name,
    surname = excluded.surname,
    avatar_url = excluded.avatar_url,
    avatar_letter = excluded.avatar_letter,
    avatar_colour = excluded.avatar_colour;

  return new;
end;
$$;

drop trigger if exists trg_predictor_profiles_sync_user_profiles on public.predictor_profiles;
create trigger trg_predictor_profiles_sync_user_profiles
after insert or update on public.predictor_profiles
for each row execute function public.sync_predictor_profile_to_user_profile();

-- Display-name moderation on predictor_profiles (same rules as user_profiles).
create or replace function public.enforce_predictor_profiles_display_name_moderation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_name is not null
     and trim(new.display_name) <> ''
     and public.contains_banned_display_word(new.display_name) then
    raise exception 'display_name contains a word that is not allowed'
      using errcode = '23514';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_predictor_profiles_display_name_moderation on public.predictor_profiles;
create trigger trg_predictor_profiles_display_name_moderation
before insert or update of display_name on public.predictor_profiles
for each row execute function public.enforce_predictor_profiles_display_name_moderation();

alter table public.predictor_profiles enable row level security;

drop policy if exists predictor_profiles_select_own on public.predictor_profiles;
create policy predictor_profiles_select_own on public.predictor_profiles
for select using (auth.uid() = user_id);

drop policy if exists predictor_profiles_select_public_rankings on public.predictor_profiles;
create policy predictor_profiles_select_public_rankings on public.predictor_profiles
for select using (true);

drop policy if exists predictor_profiles_insert_own on public.predictor_profiles;
create policy predictor_profiles_insert_own on public.predictor_profiles
for insert with check (auth.uid() = user_id);

drop policy if exists predictor_profiles_update_own on public.predictor_profiles;
create policy predictor_profiles_update_own on public.predictor_profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Memory Map profile (display, contributor name, onboarding)
-- ---------------------------------------------------------------------------

create table if not exists public.memory_map_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  contributor_name text,
  avatar_url text,
  onboarding_completed_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.enforce_memory_map_profiles_display_name_moderation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_name is not null
     and trim(new.display_name) <> ''
     and public.contains_banned_display_word(new.display_name) then
    raise exception 'display_name contains a word that is not allowed'
      using errcode = '23514';
  end if;
  if new.contributor_name is not null
     and trim(new.contributor_name) <> ''
     and public.contains_banned_display_word(new.contributor_name) then
    raise exception 'contributor_name contains a word that is not allowed'
      using errcode = '23514';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_memory_map_profiles_display_name_moderation on public.memory_map_profiles;
create trigger trg_memory_map_profiles_display_name_moderation
before insert or update of display_name, contributor_name on public.memory_map_profiles
for each row execute function public.enforce_memory_map_profiles_display_name_moderation();

alter table public.memory_map_profiles enable row level security;

drop policy if exists memory_map_profiles_select_own on public.memory_map_profiles;
create policy memory_map_profiles_select_own on public.memory_map_profiles
for select using (auth.uid() = user_id);

drop policy if exists memory_map_profiles_insert_own on public.memory_map_profiles;
create policy memory_map_profiles_insert_own on public.memory_map_profiles
for insert with check (auth.uid() = user_id);

drop policy if exists memory_map_profiles_update_own on public.memory_map_profiles;
create policy memory_map_profiles_update_own on public.memory_map_profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_product_roles enable row level security;

drop policy if exists user_product_roles_select_own on public.user_product_roles;
create policy user_product_roles_select_own on public.user_product_roles
for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Product-scoped platform admin helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_global_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_product_roles r
    where r.user_id = p_user_id
      and r.product_key = 'global'
      and r.role = 'platform_admin'
  );
$$;

create or replace function public.is_predictor_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_global_platform_admin(p_user_id)
    or exists (
      select 1
      from public.user_product_roles r
      where r.user_id = p_user_id
        and r.product_key = 'predictor'
        and r.role = 'platform_admin'
    )
    or exists (
      select 1
      from public.user_profiles up
      where up.id = p_user_id
        and up.role = 'admin'
    );
$$;

create or replace function public.is_memory_map_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_global_platform_admin(p_user_id)
    or exists (
      select 1
      from public.user_product_roles r
      where r.user_id = p_user_id
        and r.product_key = 'memory_map'
        and r.role = 'platform_admin'
    );
$$;

-- Predictor internal tools only (pools admin, fixtures, etc.).
create or replace function public.is_app_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_predictor_platform_admin(p_user_id);
$$;

-- ---------------------------------------------------------------------------
-- Memory Map permission helpers — use Memory Map platform admin, not Predictor
-- ---------------------------------------------------------------------------

create or replace function public.is_organisation_admin(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_memory_map_platform_admin(p_user_id)
    or exists (
      select 1
      from public.organisation_members om
      where om.organisation_id = p_org_id
        and om.user_id = p_user_id
        and om.status = 'approved'
        and om.role = 'admin'
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
    public.is_memory_map_platform_admin(p_user_id)
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

drop policy if exists organisation_members_self_select on public.organisation_members;
create policy organisation_members_self_select on public.organisation_members
for select using (
  user_id = auth.uid()
  or public.is_memory_map_platform_admin(auth.uid())
  or public.is_organisation_admin(organisation_id, auth.uid())
);

drop policy if exists organisation_members_platform_manage on public.organisation_members;
create policy organisation_members_platform_manage on public.organisation_members
for all using (
  public.is_memory_map_platform_admin(auth.uid())
) with check (
  public.is_memory_map_platform_admin(auth.uid())
);

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
        or public.is_memory_map_platform_admin(p_user_id)
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

drop policy if exists organisations_app_admin_select on public.organisations;
create policy organisations_app_admin_select on public.organisations
for select using (public.is_memory_map_platform_admin(auth.uid()));

drop policy if exists organisations_admin_select on public.organisations;
create policy organisations_admin_select on public.organisations
for select using (
  public.is_memory_map_platform_admin(auth.uid())
  or public.is_organisation_admin(id, auth.uid())
  or exists (
    select 1
    from public.memory_maps mm
    where mm.organisation_id = organisations.id
      and mm.status in ('active', 'draft')
      and mm.visibility in ('public', 'link_only')
  )
);

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
  if not public.is_memory_map_platform_admin(v_uid) then raise exception 'forbidden'; end if;

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
  if not public.is_memory_map_platform_admin(v_uid) then raise exception 'forbidden'; end if;
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

  if public.is_memory_map_platform_admin(v_uid) then
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
      else 'contributor'
    end::text
  from public.memory_maps mm
  join public.organisations o on o.id = mm.organisation_id
  join public.memory_map_members m on m.memory_map_id = mm.id and m.user_id = v_uid and m.status = 'approved'
  order by mm.id, mm.title;
end;
$$;

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
  if not public.is_memory_map_platform_admin(v_uid) then raise exception 'forbidden'; end if;
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
         public.is_memory_map_platform_admin(v_uid)
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

grant execute on function public.is_global_platform_admin(uuid) to authenticated;
grant execute on function public.is_predictor_platform_admin(uuid) to authenticated;
grant execute on function public.is_memory_map_platform_admin(uuid) to authenticated;

comment on column public.user_profiles.role is
  'Legacy Predictor admin flag. Prefer user_product_roles. Still checked by is_predictor_platform_admin during transition.';

notify pgrst, 'reload schema';
