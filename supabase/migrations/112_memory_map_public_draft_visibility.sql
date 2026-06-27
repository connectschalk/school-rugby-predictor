-- Allow draft Memory Maps with public/link_only visibility to load on public routes
-- (setup/pilot preview). Archived maps stay hidden from anonymous reads.

create or replace function public.memory_map_is_publicly_viewable(p_map_id uuid)
returns boolean
language sql
stable
security invoker
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

drop policy if exists memory_maps_public_select on public.memory_maps;
create policy memory_maps_public_select on public.memory_maps
for select using (
  status in ('active', 'draft')
  and visibility in ('public', 'link_only')
);

drop policy if exists memory_areas_public_select on public.memory_areas;
create policy memory_areas_public_select on public.memory_areas
for select using (
  is_active = true
  and public.memory_map_is_publicly_viewable(memory_map_id)
);

drop policy if exists memory_categories_public_select on public.memory_categories;
create policy memory_categories_public_select on public.memory_categories
for select using (
  is_active = true
  and public.memory_map_is_publicly_viewable(memory_map_id)
);

drop policy if exists memory_pins_public_select on public.memory_pins;
create policy memory_pins_public_select on public.memory_pins
for select using (
  status = 'approved'
  and exists (
    select 1
    from public.memory_areas ma
    where ma.id = memory_pins.area_id
      and public.memory_map_is_publicly_viewable(ma.memory_map_id)
  )
);

drop policy if exists memory_stories_public_select on public.memory_stories;
create policy memory_stories_public_select on public.memory_stories
for select using (
  status = 'approved'
  and exists (
    select 1
    from public.memory_pins mp
    join public.memory_areas ma on ma.id = mp.area_id
    where mp.id = memory_stories.pin_id
      and public.memory_map_is_publicly_viewable(ma.memory_map_id)
  )
);

drop policy if exists memory_tags_public_select on public.memory_tags;
create policy memory_tags_public_select on public.memory_tags
for select using (
  public.memory_map_is_publicly_viewable(memory_map_id)
);

drop policy if exists memory_story_tags_public_select on public.memory_story_tags;
create policy memory_story_tags_public_select on public.memory_story_tags
for select using (
  exists (
    select 1
    from public.memory_stories ms
    join public.memory_pins mp on mp.id = ms.pin_id
    join public.memory_areas ma on ma.id = mp.area_id
    where ms.id = memory_story_tags.story_id
      and public.memory_map_is_publicly_viewable(ma.memory_map_id)
  )
);

drop policy if exists memory_story_media_public_select on public.memory_story_media;
create policy memory_story_media_public_select on public.memory_story_media
for select using (
  exists (
    select 1
    from public.memory_stories ms
    join public.memory_pins mp on mp.id = ms.pin_id
    join public.memory_areas ma on ma.id = mp.area_id
    where ms.id = memory_story_media.story_id
      and ms.status = 'approved'
      and public.memory_map_is_publicly_viewable(ma.memory_map_id)
  )
);

drop policy if exists organisations_public_select on public.organisations;

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

grant execute on function public.memory_map_is_publicly_viewable(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
