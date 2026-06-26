-- Memory Map Phase 2: RPCs for story submission, moderation, branding, audit logs.

-- ---------------------------------------------------------------------------
-- Audit helper (internal + callable by admins)
-- ---------------------------------------------------------------------------

create or replace function public.create_memory_audit_log(
  p_memory_map_id uuid,
  p_action_type text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  insert into public.memory_audit_logs (
    memory_map_id, actor_user_id, action_type, entity_type, entity_id, old_value, new_value, reason
  ) values (
    p_memory_map_id, v_uid, p_action_type, p_entity_type, p_entity_id, p_old_value, p_new_value, p_reason
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contributor access request
-- ---------------------------------------------------------------------------

create or replace function public.request_memory_map_contributor_access(
  p_memory_map_id uuid,
  p_relationship text default null,
  p_request_message text default null
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
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  insert into public.memory_map_members (
    memory_map_id, user_id, role, status, relationship, request_message
  ) values (
    p_memory_map_id, v_uid, 'contributor', 'pending',
    nullif(trim(coalesce(p_relationship, '')), ''),
    nullif(trim(coalesce(p_request_message, '')), '')
  )
  on conflict (memory_map_id, user_id) do update
  set
    role = 'contributor',
    status = case
      when public.memory_map_members.status = 'approved' then public.memory_map_members.status
      else 'pending'
    end,
    relationship = coalesce(excluded.relationship, public.memory_map_members.relationship),
    request_message = coalesce(excluded.request_message, public.memory_map_members.request_message)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.review_memory_map_member(
  p_member_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.memory_map_members;
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
    perform public.create_memory_audit_log(
      v_row.memory_map_id, 'contributor_approved', 'member', p_member_id,
      to_jsonb(v_row), jsonb_build_object('status', 'approved'), p_reason
    );
  elsif p_action = 'reject' then
    update public.memory_map_members set status = 'rejected' where id = p_member_id;
    perform public.create_memory_audit_log(
      v_row.memory_map_id, 'contributor_rejected', 'member', p_member_id,
      to_jsonb(v_row), jsonb_build_object('status', 'rejected'), p_reason
    );
  elsif p_action = 'suspend' then
    update public.memory_map_members set status = 'suspended' where id = p_member_id;
    perform public.create_memory_audit_log(
      v_row.memory_map_id, 'contributor_suspended', 'member', p_member_id,
      to_jsonb(v_row), jsonb_build_object('status', 'suspended'), p_reason
    );
  else
    raise exception 'invalid action';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submit story (pin create + story + media + tags)
-- ---------------------------------------------------------------------------

create or replace function public.submit_memory_story(
  p_memory_map_id uuid,
  p_area_id uuid,
  p_existing_pin_id uuid,
  p_pin_title text,
  p_pin_description text,
  p_pin_category_id uuid,
  p_pin_lat double precision,
  p_pin_lng double precision,
  p_pin_x double precision,
  p_pin_y double precision,
  p_title text,
  p_description text,
  p_story_type text,
  p_event_year integer,
  p_upload_mode text,
  p_risk_level text,
  p_logged_by_display_name text,
  p_has_permission_confirmed boolean,
  p_tags text[],
  p_media jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pin_id uuid;
  v_story_id uuid;
  v_area public.memory_areas;
  v_cat_colour text;
  v_tag text;
  v_tag_id uuid;
  v_media jsonb;
  v_sort integer := 0;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.is_memory_map_contributor(p_memory_map_id, v_uid) then
    raise exception 'contributor access required';
  end if;
  if trim(coalesce(p_title, '')) = '' then raise exception 'title required'; end if;
  if trim(coalesce(p_description, '')) = '' then raise exception 'description required'; end if;
  if p_event_year is null or p_event_year < 1800 or p_event_year > 2100 then
    raise exception 'valid event year required';
  end if;
  if not coalesce(p_has_permission_confirmed, false) then
    raise exception 'permission confirmation required';
  end if;

  select * into v_area from public.memory_areas
  where id = p_area_id and memory_map_id = p_memory_map_id and is_active = true;
  if not found then raise exception 'invalid area'; end if;

  select colour into v_cat_colour from public.memory_categories where id = p_pin_category_id;

  if p_existing_pin_id is not null then
    v_pin_id := p_existing_pin_id;
    if not exists (
      select 1 from public.memory_pins p
      join public.memory_areas ma on ma.id = p.area_id
      where p.id = v_pin_id and ma.memory_map_id = p_memory_map_id
    ) then
      raise exception 'invalid pin';
    end if;
  else
    if trim(coalesce(p_pin_title, '')) = '' then raise exception 'pin title required'; end if;
    if v_area.map_type = 'geo' and (p_pin_lat is null or p_pin_lng is null) then
      raise exception 'geo pin location required';
    end if;
    if v_area.map_type = 'image' and (p_pin_x is null or p_pin_y is null) then
      raise exception 'image map pin position required';
    end if;

    insert into public.memory_pins (
      area_id, category_id, title, description, lat, lng, x_position, y_position,
      status, colour, created_by, updated_by
    ) values (
      p_area_id, p_pin_category_id, trim(p_pin_title), nullif(trim(coalesce(p_pin_description, '')), ''),
      p_pin_lat, p_pin_lng, p_pin_x, p_pin_y,
      'pending', coalesce(v_cat_colour, '#FFD400'), v_uid, v_uid
    )
    returning id into v_pin_id;

    perform public.create_memory_audit_log(
      p_memory_map_id, 'pin_created', 'pin', v_pin_id, null,
      jsonb_build_object('title', trim(p_pin_title)), null
    );
  end if;

  insert into public.memory_stories (
    pin_id, title, description, story_type, event_year, uploaded_by,
    logged_by_display_name, upload_mode, risk_level, status, has_permission_confirmed
  ) values (
    v_pin_id, trim(p_title), trim(p_description), coalesce(p_story_type, 'mixed'),
    p_event_year, v_uid, nullif(trim(coalesce(p_logged_by_display_name, '')), ''),
    coalesce(p_upload_mode, 'archive_submission'), coalesce(p_risk_level, 'low'),
    'pending_review', true
  )
  returning id into v_story_id;

  if p_media is not null and jsonb_typeof(p_media) = 'array' then
    for v_media in select * from jsonb_array_elements(p_media)
    loop
      insert into public.memory_story_media (
        story_id, media_type, file_url, thumbnail_url, file_name, file_size, mime_type, sort_order
      ) values (
        v_story_id,
        coalesce(v_media->>'media_type', 'image'),
        v_media->>'file_url',
        v_media->>'thumbnail_url',
        v_media->>'file_name',
        nullif(v_media->>'file_size', '')::integer,
        v_media->>'mime_type',
        coalesce((v_media->>'sort_order')::integer, v_sort)
      );
      v_sort := v_sort + 1;
    end loop;
  end if;

  if p_tags is not null then
    foreach v_tag in array p_tags
    loop
      v_tag := lower(trim(v_tag));
      if v_tag = '' then continue; end if;
      insert into public.memory_tags (memory_map_id, name)
      values (p_memory_map_id, v_tag)
      on conflict (memory_map_id, name) do nothing;
      select id into v_tag_id from public.memory_tags
      where memory_map_id = p_memory_map_id and name = v_tag;
      if v_tag_id is not null then
        insert into public.memory_story_tags (story_id, tag_id)
        values (v_story_id, v_tag_id)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return v_story_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approve / reject story
-- ---------------------------------------------------------------------------

create or replace function public.approve_memory_story(p_story_id uuid)
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

  v_map_id := public.memory_map_id_for_pin(v_story.pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  update public.memory_stories
  set status = 'approved', approved_by = v_uid, approved_at = now(), updated_at = now()
  where id = p_story_id;

  select * into v_pin from public.memory_pins where id = v_story.pin_id;
  if v_pin.status = 'pending' then
    update public.memory_pins set status = 'approved', updated_by = v_uid, updated_at = now()
    where id = v_pin.id;
  end if;

  perform public.create_memory_audit_log(
    v_map_id, 'story_approved', 'story', p_story_id,
    to_jsonb(v_story), jsonb_build_object('status', 'approved'), null
  );
end;
$$;

create or replace function public.reject_memory_story(p_story_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_story public.memory_stories;
  v_map_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_story from public.memory_stories where id = p_story_id;
  if not found then raise exception 'story not found'; end if;

  v_map_id := public.memory_map_id_for_pin(v_story.pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  update public.memory_stories
  set status = 'rejected', rejection_reason = nullif(trim(coalesce(p_reason, '')), ''),
      rejected_by = v_uid, rejected_at = now(), updated_at = now()
  where id = p_story_id;

  perform public.create_memory_audit_log(
    v_map_id, 'story_rejected', 'story', p_story_id,
    to_jsonb(v_story), jsonb_build_object('status', 'rejected'), p_reason
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Move pin / story, archive, delete
-- ---------------------------------------------------------------------------

create or replace function public.move_memory_pin(
  p_pin_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_x double precision,
  p_y double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pin public.memory_pins;
  v_map_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_pin from public.memory_pins where id = p_pin_id;
  if not found then raise exception 'pin not found'; end if;
  v_map_id := public.memory_map_id_for_pin(p_pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  v_old := jsonb_build_object('lat', v_pin.lat, 'lng', v_pin.lng, 'x', v_pin.x_position, 'y', v_pin.y_position);

  update public.memory_pins
  set
    lat = coalesce(p_lat, lat),
    lng = coalesce(p_lng, lng),
    x_position = coalesce(p_x, x_position),
    y_position = coalesce(p_y, y_position),
    updated_by = v_uid,
    updated_at = now()
  where id = p_pin_id
  returning jsonb_build_object('lat', lat, 'lng', lng, 'x', x_position, 'y', y_position) into v_new;

  perform public.create_memory_audit_log(v_map_id, 'pin_moved', 'pin', p_pin_id, v_old, v_new, null);
end;
$$;

create or replace function public.move_memory_story(
  p_story_id uuid,
  p_destination_pin_id uuid,
  p_new_pin jsonb default null
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
  v_new_pin_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_story from public.memory_stories where id = p_story_id;
  if not found then raise exception 'story not found'; end if;
  v_map_id := public.memory_map_id_for_pin(v_story.pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  if p_destination_pin_id is not null then
    v_new_pin_id := p_destination_pin_id;
  elsif p_new_pin is not null then
    insert into public.memory_pins (
      area_id, category_id, title, description, lat, lng, x_position, y_position,
      status, colour, created_by, updated_by
    ) values (
      (p_new_pin->>'area_id')::uuid,
      nullif(p_new_pin->>'category_id', '')::uuid,
      p_new_pin->>'title',
      p_new_pin->>'description',
      nullif(p_new_pin->>'lat', '')::double precision,
      nullif(p_new_pin->>'lng', '')::double precision,
      nullif(p_new_pin->>'x', '')::double precision,
      nullif(p_new_pin->>'y', '')::double precision,
      coalesce(p_new_pin->>'status', 'approved'),
      p_new_pin->>'colour',
      v_uid, v_uid
    )
    returning id into v_new_pin_id;
    perform public.create_memory_audit_log(
      v_map_id, 'pin_created', 'pin', v_new_pin_id, null, p_new_pin, 'created for story move'
    );
  else
    raise exception 'destination pin required';
  end if;

  update public.memory_stories
  set pin_id = v_new_pin_id, previous_pin_id = v_story.pin_id,
      moved_by = v_uid, moved_at = now(), updated_at = now()
  where id = p_story_id;

  perform public.create_memory_audit_log(
    v_map_id, 'story_moved', 'story', p_story_id,
    jsonb_build_object('pin_id', v_story.pin_id),
    jsonb_build_object('pin_id', v_new_pin_id), null
  );
end;
$$;

create or replace function public.set_memory_story_status(
  p_story_id uuid,
  p_status text,
  p_reason text default null
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
  v_action text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_status not in ('archived', 'deleted') then raise exception 'invalid status'; end if;

  select * into v_story from public.memory_stories where id = p_story_id;
  if not found then raise exception 'story not found'; end if;
  v_map_id := public.memory_map_id_for_pin(v_story.pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  v_action := case when p_status = 'archived' then 'story_archived' else 'story_deleted' end;

  update public.memory_stories
  set
    status = p_status,
    deleted_by = case when p_status = 'deleted' then v_uid else deleted_by end,
    deleted_at = case when p_status = 'deleted' then now() else deleted_at end,
    updated_at = now()
  where id = p_story_id;

  perform public.create_memory_audit_log(
    v_map_id, v_action, 'story', p_story_id, to_jsonb(v_story),
    jsonb_build_object('status', p_status), p_reason
  );
end;
$$;

create or replace function public.set_memory_pin_status(
  p_pin_id uuid,
  p_status text,
  p_story_action text default 'none',
  p_move_stories_to_pin_id uuid default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pin public.memory_pins;
  v_map_id uuid;
  v_action text;
  v_story_count integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_status not in ('archived', 'deleted') then raise exception 'invalid status'; end if;

  select * into v_pin from public.memory_pins where id = p_pin_id;
  if not found then raise exception 'pin not found'; end if;
  v_map_id := public.memory_map_id_for_pin(p_pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  select count(*) into v_story_count from public.memory_stories
  where pin_id = p_pin_id and status not in ('deleted', 'archived');

  if v_story_count > 0 then
    if p_story_action = 'move' and p_move_stories_to_pin_id is not null then
      update public.memory_stories
      set pin_id = p_move_stories_to_pin_id, previous_pin_id = p_pin_id,
          moved_by = v_uid, moved_at = now(), updated_at = now()
      where pin_id = p_pin_id and status not in ('deleted', 'archived');
    elsif p_story_action = 'archive_stories' then
      update public.memory_stories set status = 'archived', updated_at = now()
      where pin_id = p_pin_id and status not in ('deleted', 'archived');
    elsif p_story_action = 'delete_stories' then
      update public.memory_stories
      set status = 'deleted', deleted_by = v_uid, deleted_at = now(), updated_at = now()
      where pin_id = p_pin_id and status not in ('deleted', 'archived');
    elsif p_story_action <> 'none' then
      raise exception 'invalid story action';
    end if;
  end if;

  v_action := case when p_status = 'archived' then 'pin_archived' else 'pin_deleted' end;

  update public.memory_pins
  set
    status = p_status,
    deleted_by = case when p_status = 'deleted' then v_uid else deleted_by end,
    deleted_at = case when p_status = 'deleted' then now() else deleted_at end,
    updated_by = v_uid,
    updated_at = now()
  where id = p_pin_id;

  perform public.create_memory_audit_log(
    v_map_id, v_action, 'pin', p_pin_id, to_jsonb(v_pin),
    jsonb_build_object('status', p_status, 'story_action', p_story_action), p_reason
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Branding & sponsor
-- ---------------------------------------------------------------------------

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
  if not public.is_memory_map_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;

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
  if not public.is_memory_map_admin(p_map_id, v_uid) then raise exception 'forbidden'; end if;

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

-- Contributor media insert policy (storage paths under map id)
create policy memory_story_media_contributor_insert on public.memory_story_media
for insert with check (
  exists (
    select 1 from public.memory_stories s
    where s.id = story_id
      and s.uploaded_by = auth.uid()
      and s.status = 'pending_review'
  )
);

revoke all on function public.create_memory_audit_log(uuid, text, text, uuid, jsonb, jsonb, text) from public;
revoke all on function public.request_memory_map_contributor_access(uuid, text, text) from public;
revoke all on function public.review_memory_map_member(uuid, text, text) from public;
revoke all on function public.submit_memory_story(uuid, uuid, uuid, text, text, uuid, double precision, double precision, double precision, double precision, text, text, text, integer, text, text, text, boolean, text[], jsonb) from public;
revoke all on function public.approve_memory_story(uuid) from public;
revoke all on function public.reject_memory_story(uuid, text) from public;
revoke all on function public.move_memory_pin(uuid, double precision, double precision, double precision, double precision) from public;
revoke all on function public.move_memory_story(uuid, uuid, jsonb) from public;
revoke all on function public.set_memory_story_status(uuid, text, text) from public;
revoke all on function public.set_memory_pin_status(uuid, text, text, uuid, text) from public;
revoke all on function public.update_memory_map_branding(uuid, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.update_memory_map_sponsor(uuid, text, text, text, text) from public;

grant execute on function public.create_memory_audit_log(uuid, text, text, uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.request_memory_map_contributor_access(uuid, text, text) to authenticated;
grant execute on function public.review_memory_map_member(uuid, text, text) to authenticated;
grant execute on function public.submit_memory_story(uuid, uuid, uuid, text, text, uuid, double precision, double precision, double precision, double precision, text, text, text, integer, text, text, text, boolean, text[], jsonb) to authenticated;
grant execute on function public.approve_memory_story(uuid) to authenticated;
grant execute on function public.reject_memory_story(uuid, text) to authenticated;
grant execute on function public.move_memory_pin(uuid, double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.move_memory_story(uuid, uuid, jsonb) to authenticated;
grant execute on function public.set_memory_story_status(uuid, text, text) to authenticated;
grant execute on function public.set_memory_pin_status(uuid, text, text, uuid, text) to authenticated;
grant execute on function public.update_memory_map_branding(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_memory_map_sponsor(uuid, text, text, text, text) to authenticated;

-- Allow contributors to insert tags for their map (via submit RPC mostly, but direct tag create needed)
create policy memory_tags_contributor_insert on public.memory_tags
for insert with check (
  public.is_memory_map_contributor(memory_map_id, auth.uid())
);

create policy memory_story_tags_contributor_insert on public.memory_story_tags
for insert with check (
  exists (
    select 1 from public.memory_stories s
    where s.id = story_id and s.uploaded_by = auth.uid()
  )
);

-- Contributors can read own pending stories
create policy memory_stories_contributor_select on public.memory_stories
for select using (
  uploaded_by = auth.uid()
  or public.is_memory_map_admin(public.memory_map_id_for_pin(pin_id), auth.uid())
);

-- Admins can read all pins including pending
create policy memory_pins_admin_select on public.memory_pins
for select using (
  public.is_memory_map_admin(public.memory_map_id_for_pin(id), auth.uid())
);

-- Contributors can read pending pins they created
create policy memory_pins_contributor_select on public.memory_pins
for select using (created_by = auth.uid());

-- App admins: auto-seed as memory map admin member on first admin action (optional)
-- Map creators: grant created_by admin in seed
