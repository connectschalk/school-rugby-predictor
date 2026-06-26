-- Enable pgcrypto for invite token generation (gen_random_bytes).

create extension if not exists pgcrypto;

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

revoke all on function public.create_memory_map_invite(uuid, text, boolean, timestamptz) from public;
grant execute on function public.create_memory_map_invite(uuid, text, boolean, timestamptz) to authenticated;
