-- Organisation admin email invites + organisation branding columns.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organisation branding (optional defaults for new maps)
-- ---------------------------------------------------------------------------

alter table public.organisations
  add column if not exists primary_color text,
  add column if not exists secondary_color text;

-- Extend organisation types (keep legacy values).
alter table public.organisations drop constraint if exists organisations_type_check;
alter table public.organisations
  add constraint organisations_type_check
  check (type in (
    'school', 'event', 'venue', 'club', 'community',
    'place', 'family', 'organisation', 'other'
  ));

-- ---------------------------------------------------------------------------
-- Organisation admin invites
-- ---------------------------------------------------------------------------

create table if not exists public.memory_map_admin_invites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email text not null,
  role text not null default 'admin'
    check (role in ('admin', 'moderator', 'viewer')),
  token text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_display_name text,
  invite_message text,
  invited_by uuid references auth.users (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_map_admin_invites_org_idx
  on public.memory_map_admin_invites (organisation_id);

create index if not exists memory_map_admin_invites_email_lower_idx
  on public.memory_map_admin_invites (lower(email));

create index if not exists memory_map_admin_invites_token_idx
  on public.memory_map_admin_invites (token);

create index if not exists memory_map_admin_invites_status_idx
  on public.memory_map_admin_invites (status);

alter table public.memory_map_admin_invites enable row level security;

drop policy if exists memory_map_admin_invites_platform_select on public.memory_map_admin_invites;
create policy memory_map_admin_invites_platform_select on public.memory_map_admin_invites
for select using (public.is_memory_map_platform_admin(auth.uid()));

drop policy if exists memory_map_admin_invites_platform_manage on public.memory_map_admin_invites;
create policy memory_map_admin_invites_platform_manage on public.memory_map_admin_invites
for all using (public.is_memory_map_platform_admin(auth.uid()))
with check (public.is_memory_map_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Create organisation only (platform admin)
-- ---------------------------------------------------------------------------

create or replace function public.create_memory_map_organisation(
  p_name text,
  p_type text default 'school',
  p_slug text default null,
  p_description text default null,
  p_logo_url text default null,
  p_primary_color text default '#FFD400',
  p_secondary_color text default '#005DAA'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_slug text := lower(trim(regexp_replace(coalesce(p_slug, p_name, ''), '[^a-z0-9-]+', '-', 'g')));
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_platform_admin(v_uid) then raise exception 'forbidden'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'organisation name required'; end if;
  if v_slug = '' then raise exception 'invalid slug'; end if;
  if p_type not in (
    'school', 'event', 'venue', 'club', 'community',
    'place', 'family', 'organisation', 'other'
  ) then raise exception 'invalid organisation type'; end if;

  insert into public.organisations (
    name, slug, type, description, logo_url,
    primary_color, secondary_color, created_by
  ) values (
    trim(p_name), v_slug, p_type,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    nullif(trim(coalesce(p_primary_color, '')), ''),
    nullif(trim(coalesce(p_secondary_color, '')), ''),
    v_uid
  )
  returning id into v_org_id;

  return v_org_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invite organisation admin by email
-- ---------------------------------------------------------------------------

create or replace function public.create_organisation_admin_invite(
  p_organisation_id uuid,
  p_email text,
  p_role text default 'admin',
  p_invited_display_name text default null,
  p_invite_message text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_platform_admin(v_uid) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.organisations where id = p_organisation_id) then
    raise exception 'organisation not found';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'invalid email'; end if;
  if p_role not in ('admin', 'moderator', 'viewer') then raise exception 'invalid role'; end if;

  if exists (
    select 1 from public.memory_map_admin_invites i
    where i.organisation_id = p_organisation_id
      and lower(i.email) = v_email
      and i.status = 'pending'
      and i.expires_at > now()
  ) then
    raise exception 'a pending invite already exists for this email';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.memory_map_admin_invites (
    organisation_id, email, role, token, status,
    invited_display_name, invite_message, invited_by, expires_at
  ) values (
    p_organisation_id, v_email, p_role, v_token, 'pending',
    nullif(trim(coalesce(p_invited_display_name, '')), ''),
    nullif(trim(coalesce(p_invite_message, '')), ''),
    v_uid, now() + interval '14 days'
  );

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lookup invite (anon — minimal public fields via RPC)
-- ---------------------------------------------------------------------------

create or replace function public.lookup_organisation_admin_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invite public.memory_map_admin_invites;
  v_org public.organisations;
begin
  if p_token is null or trim(p_token) = '' then return null; end if;

  select * into v_invite
  from public.memory_map_admin_invites
  where token = trim(p_token);

  if not found then return null; end if;

  if v_invite.status = 'pending' and v_invite.expires_at < now() then
    update public.memory_map_admin_invites
    set status = 'expired', updated_at = now()
    where id = v_invite.id;
    v_invite.status := 'expired';
  end if;

  select * into v_org from public.organisations where id = v_invite.organisation_id;

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'organisation_id', v_invite.organisation_id,
    'organisation_name', v_org.name,
    'organisation_slug', v_org.slug,
    'organisation_type', v_org.type,
    'email', v_invite.email,
    'role', v_invite.role,
    'status', v_invite.status,
    'invited_display_name', v_invite.invited_display_name,
    'expires_at', v_invite.expires_at,
    'accepted_at', v_invite.accepted_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Accept invite (authenticated — email must match)
-- ---------------------------------------------------------------------------

create or replace function public.accept_organisation_admin_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.memory_map_admin_invites;
  v_user_email text;
  v_org public.organisations;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_token is null or trim(p_token) = '' then raise exception 'invalid invite'; end if;

  select email into v_user_email from auth.users where id = v_uid;
  if v_user_email is null then raise exception 'user email not found'; end if;

  select * into v_invite
  from public.memory_map_admin_invites
  where token = trim(p_token)
  for update;

  if not found then raise exception 'invite not found'; end if;

  if v_invite.status = 'revoked' then raise exception 'invite has been revoked'; end if;
  if v_invite.status = 'accepted' then raise exception 'invite already accepted'; end if;
  if v_invite.status = 'expired' or v_invite.expires_at < now() then
    update public.memory_map_admin_invites set status = 'expired', updated_at = now() where id = v_invite.id;
    raise exception 'invite has expired';
  end if;
  if v_invite.status <> 'pending' then raise exception 'invite is not valid'; end if;

  if lower(trim(v_user_email)) <> lower(trim(v_invite.email)) then
    raise exception 'signed-in email does not match invite email';
  end if;

  insert into public.organisation_members (
    organisation_id, user_id, role, status, approved_by, approved_at
  ) values (
    v_invite.organisation_id, v_uid, v_invite.role, 'approved', v_invite.invited_by, now()
  )
  on conflict (organisation_id, user_id) do update
  set
    role = excluded.role,
    status = 'approved',
    approved_by = coalesce(public.organisation_members.approved_by, excluded.approved_by),
    approved_at = coalesce(public.organisation_members.approved_at, excluded.approved_at);

  update public.memory_map_admin_invites
  set
    status = 'accepted',
    accepted_by = v_uid,
    accepted_at = now(),
    updated_at = now()
  where id = v_invite.id;

  select * into v_org from public.organisations where id = v_invite.organisation_id;

  return jsonb_build_object(
    'organisation_id', v_org.id,
    'organisation_slug', v_org.slug,
    'organisation_name', v_org.name,
    'role', v_invite.role
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Revoke pending invite
-- ---------------------------------------------------------------------------

create or replace function public.revoke_organisation_admin_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_platform_admin(v_uid) then raise exception 'forbidden'; end if;

  update public.memory_map_admin_invites
  set status = 'revoked', updated_at = now()
  where id = p_invite_id and status = 'pending';

  if not found then raise exception 'invite not found or not pending'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Remove organisation admin (member row only)
-- ---------------------------------------------------------------------------

create or replace function public.remove_organisation_admin(
  p_organisation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_platform_admin(v_uid) then raise exception 'forbidden'; end if;

  delete from public.organisation_members
  where organisation_id = p_organisation_id
    and user_id = p_user_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then raise exception 'member not found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fix org-admin map listing (restore left join + org admin OR map member)
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
  left join public.memory_map_members m
    on m.memory_map_id = mm.id and m.user_id = v_uid and m.status = 'approved'
  where public.is_organisation_admin(o.id, v_uid)
     or m.user_id is not null
  order by mm.id, mm.title;
end;
$$;

grant execute on function public.create_memory_map_organisation(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_organisation_admin_invite(uuid, text, text, text, text) to authenticated;
grant execute on function public.lookup_organisation_admin_invite(text) to anon, authenticated;
grant execute on function public.accept_organisation_admin_invite(text) to authenticated;
grant execute on function public.revoke_organisation_admin_invite(uuid) to authenticated;
grant execute on function public.remove_organisation_admin(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
