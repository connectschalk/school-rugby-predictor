-- Per-pool logos (public invite + in-app pool chrome).

alter table public.pools
  add column if not exists logo_url text,
  add column if not exists logo_path text,
  add column if not exists logo_updated_at timestamptz;

comment on column public.pools.logo_url is 'Public URL for pool logo (Supabase Storage pool-logos bucket).';
comment on column public.pools.logo_path is 'Storage object path, e.g. pools/{poolId}/logo-{timestamp}.png';
comment on column public.pools.logo_updated_at is 'When logo_url/logo_path were last set.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pool-logos',
  'pool-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_pool_id_from_logo_path(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce((storage.foldername(p_name))[1], '') = 'pools'
         and coalesce((storage.foldername(p_name))[2], '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[2])::uuid
    else null
  end;
$$;

drop policy if exists "pool_logos_select_public" on storage.objects;
create policy "pool_logos_select_public"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'pool-logos');

drop policy if exists "pool_logos_insert_admin" on storage.objects;
create policy "pool_logos_insert_admin"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pool-logos'
  and public.can_manage_pool(public.storage_pool_id_from_logo_path(name), auth.uid())
);

drop policy if exists "pool_logos_update_admin" on storage.objects;
create policy "pool_logos_update_admin"
on storage.objects for update
to authenticated
using (
  bucket_id = 'pool-logos'
  and public.can_manage_pool(public.storage_pool_id_from_logo_path(name), auth.uid())
)
with check (
  bucket_id = 'pool-logos'
  and public.can_manage_pool(public.storage_pool_id_from_logo_path(name), auth.uid())
);

drop policy if exists "pool_logos_delete_admin" on storage.objects;
create policy "pool_logos_delete_admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'pool-logos'
  and public.can_manage_pool(public.storage_pool_id_from_logo_path(name), auth.uid())
);

create or replace function public.update_pool_logo(
  p_pool_id uuid,
  p_logo_url text,
  p_logo_path text
)
returns public.pools
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pool public.pools;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.can_manage_pool(p_pool_id, v_uid) then
    raise exception 'forbidden';
  end if;

  update public.pools
  set
    logo_url = nullif(trim(coalesce(p_logo_url, '')), ''),
    logo_path = nullif(trim(coalesce(p_logo_path, '')), ''),
    logo_updated_at = case
      when nullif(trim(coalesce(p_logo_url, '')), '') is null then null
      else now()
    end,
    updated_at = now()
  where id = p_pool_id
    and is_closed = false
  returning * into v_pool;

  if not found then
    raise exception 'pool not found';
  end if;

  return v_pool;
end;
$$;

revoke all on function public.update_pool_logo(uuid, text, text) from public;
grant execute on function public.update_pool_logo(uuid, text, text) to authenticated;

drop function if exists public.my_pools();

create or replace function public.my_pools()
returns table (
  id uuid,
  name text,
  admin_user_id uuid,
  created_by uuid,
  is_public boolean,
  invite_token text,
  join_code text,
  is_closed boolean,
  competition_id uuid,
  logo_url text,
  logo_path text,
  logo_updated_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.admin_user_id,
    p.created_by,
    p.is_public,
    p.invite_token,
    p.join_code,
    p.is_closed,
    p.competition_id,
    p.logo_url,
    p.logo_path,
    p.logo_updated_at,
    p.created_at,
    p.updated_at,
    pm.joined_at
  from public.pool_members pm
  join public.pools p on p.id = pm.pool_id
  where pm.user_id = auth.uid()
    and p.is_closed = false
  order by p.created_at desc;
$$;

revoke all on function public.my_pools() from public;
grant execute on function public.my_pools() to authenticated;

drop function if exists public.get_pool_by_invite_token(text, uuid);
drop function if exists public.get_pool_invite_by_token(text, uuid);

create or replace function public.get_pool_invite_by_token(
  p_token text,
  p_invited_by uuid default null
)
returns table (
  pool_id uuid,
  pool_name text,
  pool_logo_url text,
  invite_token text,
  competition_id uuid,
  competition_slug text,
  competition_name text,
  competition_logo_url text,
  is_public boolean,
  is_closed boolean,
  inviter_kind text,
  inviter_display_name text,
  inviter_avatar_url text,
  inviter_avatar_letter text,
  inviter_avatar_colour text
)
language sql
stable
security definer
set search_path = public
as $$
  with schools as (
    select c.id, c.slug, c.name, c.logo_url
    from public.competitions c
    where c.slug = 'nextplay-schools' and c.is_active = true
    limit 1
  )
  select
    p.id as pool_id,
    p.name as pool_name,
    p.logo_url as pool_logo_url,
    p.invite_token,
    coalesce(p.competition_id, s.id) as competition_id,
    coalesce(c.slug, s.slug, 'nextplay-schools') as competition_slug,
    coalesce(c.name, s.name, 'NextPlay Schools') as competition_name,
    coalesce(c.logo_url, s.logo_url) as competition_logo_url,
    p.is_public,
    p.is_closed,
    case
      when p_invited_by is not null and inv.id is not null then 'sharer'
      when nullif(trim(adm.display_name), '') is not null then 'admin'
      else 'anonymous'
    end as inviter_kind,
    case
      when p_invited_by is not null and inv.id is not null then nullif(trim(inv.display_name), '')
      else nullif(trim(adm.display_name), '')
    end as inviter_display_name,
    coalesce(inv.avatar_url, adm.avatar_url) as inviter_avatar_url,
    coalesce(inv.avatar_letter, adm.avatar_letter) as inviter_avatar_letter,
    coalesce(inv.avatar_colour, adm.avatar_colour) as inviter_avatar_colour
  from public.pools p
  left join public.competitions c on c.id = p.competition_id
  cross join schools s
  left join public.user_profiles adm on adm.id = p.admin_user_id
  left join public.user_profiles inv on inv.id = p_invited_by
  where p.invite_token = trim(coalesce(p_token, ''));
$$;

revoke all on function public.get_pool_invite_by_token(text, uuid) from public;
grant execute on function public.get_pool_invite_by_token(text, uuid) to anon, authenticated;

create or replace function public.get_pool_by_invite_token(
  p_invite_token text,
  p_invited_by uuid default null
)
returns table (
  id uuid,
  name text,
  is_public boolean,
  inviter_kind text,
  inviter_display_name text,
  inviter_avatar_url text,
  inviter_avatar_letter text,
  inviter_avatar_colour text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.pool_id as id,
    d.pool_name as name,
    d.is_public,
    d.inviter_kind,
    d.inviter_display_name,
    d.inviter_avatar_url,
    d.inviter_avatar_letter,
    d.inviter_avatar_colour
  from public.get_pool_invite_by_token(p_invite_token, p_invited_by) d
  where not d.is_closed;
$$;

revoke all on function public.get_pool_by_invite_token(text, uuid) from public;
grant execute on function public.get_pool_by_invite_token(text, uuid) to anon, authenticated;
