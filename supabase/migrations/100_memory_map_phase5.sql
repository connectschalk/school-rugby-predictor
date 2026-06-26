-- Memory Map Phase 5: contributor invites, invite redemption.

create extension if not exists pgcrypto;

create table if not exists public.memory_map_invites (
  id uuid primary key default gen_random_uuid(),
  memory_map_id uuid not null references public.memory_maps (id) on delete cascade,
  invite_token text not null unique,
  role text not null default 'contributor'
    check (role in ('contributor', 'moderator', 'viewer')),
  auto_approve boolean not null default false,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists memory_map_invites_map_idx on public.memory_map_invites (memory_map_id);
create index if not exists memory_map_invites_token_idx on public.memory_map_invites (invite_token);

alter table public.memory_map_invites enable row level security;

create policy memory_map_invites_admin_select on public.memory_map_invites
for select using (public.is_memory_map_admin(memory_map_id, auth.uid()));

-- Public can validate token exists (minimal fields via RPC only).

alter table public.memory_map_members
  add column if not exists invite_id uuid references public.memory_map_invites (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Create contributor invite (map admin)
-- ---------------------------------------------------------------------------

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
  if not public.is_memory_map_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;
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

-- ---------------------------------------------------------------------------
-- Redeem invite (authenticated user)
-- ---------------------------------------------------------------------------

create or replace function public.redeem_memory_map_invite(
  p_invite_token text,
  p_relationship text default null,
  p_request_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.memory_map_invites;
  v_member_id uuid;
  v_status text;
  v_message text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_invite_token is null or trim(p_invite_token) = '' then raise exception 'invalid invite'; end if;

  select * into v_invite
  from public.memory_map_invites
  where invite_token = trim(p_invite_token);

  if not found then raise exception 'invite not found'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite expired';
  end if;

  v_message := coalesce(nullif(trim(coalesce(p_request_message, '')), ''), 'Joined via contributor invite link.');
  v_status := case when v_invite.auto_approve then 'approved' else 'pending' end;

  insert into public.memory_map_members (
    memory_map_id, user_id, role, status, relationship, request_message,
    invite_id, approved_by, approved_at
  ) values (
    v_invite.memory_map_id, v_uid, v_invite.role, v_status,
    nullif(trim(coalesce(p_relationship, '')), ''),
    v_message,
    v_invite.id,
    case when v_invite.auto_approve then v_uid else null end,
    case when v_invite.auto_approve then now() else null end
  )
  on conflict (memory_map_id, user_id) do update
  set
    role = excluded.role,
    status = case
      when public.memory_map_members.status = 'approved' then public.memory_map_members.status
      else excluded.status
    end,
    relationship = coalesce(excluded.relationship, public.memory_map_members.relationship),
    request_message = excluded.request_message,
    invite_id = excluded.invite_id,
    approved_by = case when excluded.status = 'approved' then v_uid else public.memory_map_members.approved_by end,
    approved_at = case when excluded.status = 'approved' then now() else public.memory_map_members.approved_at end
  returning id into v_member_id;

  perform public.create_memory_audit_log(
    v_invite.memory_map_id,
    case when v_invite.auto_approve then 'contributor_approved' else 'contributor_request_submitted' end,
    'member', v_member_id, null,
    jsonb_build_object('invite_id', v_invite.id, 'via_invite', true), null
  );

  return jsonb_build_object(
    'member_id', v_member_id,
    'status', v_status,
    'memory_map_id', v_invite.memory_map_id,
    'auto_approved', v_invite.auto_approve
  );
end;
$$;

-- Lookup invite for join page (anon ok — returns map slug only if valid)
create or replace function public.lookup_memory_map_invite(p_invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.memory_map_invites;
  v_slug text;
begin
  select * into v_invite from public.memory_map_invites where invite_token = trim(p_invite_token);
  if not found then return null; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then return null; end if;

  select slug into v_slug from public.memory_maps where id = v_invite.memory_map_id and status = 'active';
  if v_slug is null then return null; end if;

  return jsonb_build_object(
    'map_slug', v_slug,
    'memory_map_id', v_invite.memory_map_id,
    'role', v_invite.role,
    'expires_at', v_invite.expires_at
  );
end;
$$;

revoke all on function public.create_memory_map_invite(uuid, text, boolean, timestamptz) from public;
revoke all on function public.redeem_memory_map_invite(text, text, text) from public;
revoke all on function public.lookup_memory_map_invite(text) from public;

grant execute on function public.create_memory_map_invite(uuid, text, boolean, timestamptz) to authenticated;
grant execute on function public.redeem_memory_map_invite(text, text, text) to authenticated;
grant execute on function public.lookup_memory_map_invite(text) to anon, authenticated;
