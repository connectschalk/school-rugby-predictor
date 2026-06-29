-- Qualify pgcrypto calls for Supabase (extension lives in the extensions schema).
-- Unqualified gen_random_bytes() fails when SECURITY DEFINER functions use search_path = public.

create extension if not exists pgcrypto with schema extensions;

-- Organisation admin invite tokens
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

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

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

-- Memory Map contributor/moderator invite tokens
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

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

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

-- Predictor pools invite_token column default (if table exists)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pools'
      and column_name = 'invite_token'
  ) then
    execute $sql$
      alter table public.pools
      alter column invite_token
      set default encode(extensions.gen_random_bytes(16), 'hex')
    $sql$;
  end if;
end;
$$;

revoke all on function public.create_organisation_admin_invite(uuid, text, text, text, text) from public;
grant execute on function public.create_organisation_admin_invite(uuid, text, text, text, text) to authenticated;

revoke all on function public.create_memory_map_invite(uuid, text, boolean, timestamptz) from public;
grant execute on function public.create_memory_map_invite(uuid, text, boolean, timestamptz) to authenticated;
