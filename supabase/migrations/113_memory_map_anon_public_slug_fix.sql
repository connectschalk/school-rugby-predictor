-- Fix anonymous public slug lookups for active link_only / public Memory Maps.
--
-- memory_maps_member_select referenced memory_map_members directly in the policy
-- expression. PostgreSQL still checks table privileges for that subquery, and
-- anon has no SELECT on memory_map_members → entire memory_maps SELECT fails.

create or replace function public.can_read_private_memory_map(p_map_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and exists (
      select 1
      from public.memory_maps mm
      where mm.id = p_map_id
        and mm.status = 'active'
        and mm.visibility = 'private'
        and (
          public.is_memory_map_admin(p_map_id, p_user_id)
          or exists (
            select 1
            from public.memory_map_members m
            where m.memory_map_id = p_map_id
              and m.user_id = p_user_id
              and m.status = 'approved'
          )
        )
    );
$$;

drop policy if exists memory_maps_member_select on public.memory_maps;
create policy memory_maps_member_select on public.memory_maps
for select using (public.can_read_private_memory_map(id, auth.uid()));

-- Direct public links: active + public/link_only
drop policy if exists memory_maps_public_select on public.memory_maps;
create policy memory_maps_public_select on public.memory_maps
for select using (
  status = 'active'
  and visibility in ('public', 'link_only')
);

-- Draft direct links resolve for unavailable shell (not directory listing)
drop policy if exists memory_maps_draft_select on public.memory_maps;
create policy memory_maps_draft_select on public.memory_maps
for select using (
  status = 'draft'
  and visibility in ('public', 'link_only')
);

create or replace function public.memory_map_is_publicly_viewable(p_map_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memory_maps mm
    where mm.id = p_map_id
      and mm.status in ('active', 'draft')
      and mm.visibility in ('public', 'link_only')
  );
$$;

drop policy if exists organisations_admin_select on public.organisations;
create policy organisations_admin_select on public.organisations
for select using (
  public.is_app_admin(auth.uid())
  or public.is_organisation_admin(id, auth.uid())
  or exists (
    select 1
    from public.memory_maps mm
    where mm.organisation_id = organisations.id
      and mm.status in ('active', 'draft')
      and mm.visibility in ('public', 'link_only')
  )
);

grant execute on function public.can_read_private_memory_map(uuid, uuid) to anon, authenticated;
grant execute on function public.memory_map_is_publicly_viewable(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
