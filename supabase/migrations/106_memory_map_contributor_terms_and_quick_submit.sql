-- Contributor submission policy (once at onboarding) and relaxed quick-submit rules.

alter table public.memory_map_members
  add column if not exists submission_policy_accepted_at timestamptz,
  add column if not exists submission_policy_version text default 'v1';

-- Existing approved contributors are grandfathered in.
update public.memory_map_members
set
  submission_policy_accepted_at = coalesce(approved_at, created_at, now()),
  submission_policy_version = 'v1'
where status = 'approved'
  and submission_policy_accepted_at is null;

-- ---------------------------------------------------------------------------
-- Contributor access request (requires policy acceptance)
-- ---------------------------------------------------------------------------

drop function if exists public.request_memory_map_contributor_access(uuid, text, text);

create or replace function public.request_memory_map_contributor_access(
  p_memory_map_id uuid,
  p_relationship text default null,
  p_request_message text default null,
  p_submission_policy_accepted boolean default false
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

  if not coalesce(p_submission_policy_accepted, false) then
    raise exception 'submission policy acceptance required';
  end if;

  insert into public.memory_map_members (
    memory_map_id, user_id, role, status, relationship, request_message,
    submission_policy_accepted_at, submission_policy_version
  ) values (
    p_memory_map_id, v_uid, 'contributor', 'pending',
    nullif(trim(coalesce(p_relationship, '')), ''),
    nullif(trim(coalesce(p_request_message, '')), ''),
    now(), 'v1'
  )
  on conflict (memory_map_id, user_id) do update
  set
    role = 'contributor',
    status = case
      when public.memory_map_members.status = 'approved' then public.memory_map_members.status
      else 'pending'
    end,
    relationship = coalesce(excluded.relationship, public.memory_map_members.relationship),
    request_message = coalesce(excluded.request_message, public.memory_map_members.request_message),
    submission_policy_accepted_at = coalesce(
      public.memory_map_members.submission_policy_accepted_at,
      excluded.submission_policy_accepted_at
    ),
    submission_policy_version = coalesce(
      public.memory_map_members.submission_policy_version,
      excluded.submission_policy_version
    )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Redeem invite (requires policy acceptance)
-- ---------------------------------------------------------------------------

drop function if exists public.redeem_memory_map_invite(text, text, text);

create or replace function public.redeem_memory_map_invite(
  p_invite_token text,
  p_relationship text default null,
  p_request_message text default null,
  p_submission_policy_accepted boolean default false
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

  if not coalesce(p_submission_policy_accepted, false) then
    raise exception 'submission policy acceptance required';
  end if;

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
    invite_id, approved_by, approved_at,
    submission_policy_accepted_at, submission_policy_version
  ) values (
    v_invite.memory_map_id, v_uid, v_invite.role, v_status,
    nullif(trim(coalesce(p_relationship, '')), ''),
    v_message,
    v_invite.id,
    case when v_invite.auto_approve then v_uid else null end,
    case when v_invite.auto_approve then now() else null end,
    now(), 'v1'
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
    approved_at = case when excluded.status = 'approved' then now() else public.memory_map_members.approved_at end,
    submission_policy_accepted_at = coalesce(
      public.memory_map_members.submission_policy_accepted_at,
      excluded.submission_policy_accepted_at
    ),
    submission_policy_version = coalesce(
      public.memory_map_members.submission_policy_version,
      excluded.submission_policy_version
    )
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

-- ---------------------------------------------------------------------------
-- submit_memory_story: policy via membership OR legacy param; relaxed description
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_memory_story'
  loop
    execute format('drop function if exists public.submit_memory_story(%s)', r.args);
  end loop;
end $$;

create or replace function public.submit_memory_story(
  p_memory_map_id uuid,
  p_area_id uuid,
  p_existing_pin_id uuid default null,
  p_pin_title text default null,
  p_pin_description text default null,
  p_pin_category_id uuid default null,
  p_pin_lat double precision default null,
  p_pin_lng double precision default null,
  p_pin_x double precision default null,
  p_pin_y double precision default null,
  p_title text default null,
  p_description text default null,
  p_story_type text default 'text',
  p_event_year integer default null,
  p_upload_mode text default 'manual_geo',
  p_risk_level text default 'low',
  p_logged_by_display_name text default null,
  p_has_permission_confirmed boolean default false,
  p_contains_minors boolean default false,
  p_mentions_full_names boolean default false,
  p_shows_injury boolean default false,
  p_is_archive_content boolean default false,
  p_sponsor_or_brand_visible boolean default false,
  p_tags text[] default '{}',
  p_media jsonb default '[]'::jsonb
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
  v_category_id uuid;
  v_tag text;
  v_tag_id uuid;
  v_media jsonb;
  v_sort integer := 0;
  v_title text;
  v_description text;
  v_policy_ok boolean := false;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.is_memory_map_contributor(p_memory_map_id, v_uid) then
    raise exception 'contributor access required';
  end if;

  select exists (
    select 1
    from public.memory_map_members m
    where m.memory_map_id = p_memory_map_id
      and m.user_id = v_uid
      and m.status = 'approved'
      and m.submission_policy_accepted_at is not null
  ) into v_policy_ok;

  if not coalesce(p_has_permission_confirmed, false)
     and not coalesce(v_policy_ok, false)
     and not public.is_app_admin(v_uid) then
    raise exception 'submission policy acceptance required';
  end if;

  v_description := trim(coalesce(p_description, ''));
  v_title := coalesce(
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(left(v_description, 80), '')
  );

  if v_title is null then
    raise exception 'title required';
  end if;

  if v_description = '' then
    v_description := v_title;
  end if;

  if p_event_year is null or p_event_year < 1800 or p_event_year > 2100 then
    raise exception 'valid event year required';
  end if;

  select * into v_area
  from public.memory_areas
  where id = p_area_id and memory_map_id = p_memory_map_id and is_active = true;
  if not found then
    raise exception 'invalid area';
  end if;

  if p_existing_pin_id is not null then
    v_pin_id := p_existing_pin_id;
    if not exists (
      select 1
      from public.memory_pins p
      join public.memory_areas ma on ma.id = p.area_id
      where p.id = v_pin_id and ma.memory_map_id = p_memory_map_id
    ) then
      raise exception 'invalid pin';
    end if;
  else
    if trim(coalesce(p_pin_title, '')) = '' then
      raise exception 'pin title required';
    end if;

    if v_area.map_type = 'geo' and (p_pin_lat is null or p_pin_lng is null) then
      raise exception 'geo pin location required';
    end if;

    if v_area.map_type = 'image' and (p_pin_x is null or p_pin_y is null) then
      raise exception 'image map pin position required';
    end if;

    v_category_id := p_pin_category_id;
    if v_category_id is null then
      select id into v_category_id
      from public.memory_categories
      where memory_map_id = p_memory_map_id and is_active = true
      order by case when lower(name) = 'general' then 0 else 1 end, sort_order nulls last, created_at asc
      limit 1;
    end if;

    if v_category_id is null then
      raise exception 'at least one category is required before adding a new pin';
    end if;

    select colour into v_cat_colour from public.memory_categories where id = v_category_id;

    insert into public.memory_pins (
      area_id, category_id, title, description, lat, lng, x_position, y_position,
      status, colour, created_by, updated_by
    ) values (
      p_area_id, v_category_id, trim(p_pin_title), nullif(trim(coalesce(p_pin_description, '')), ''),
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
    logged_by_display_name, upload_mode, risk_level, status, has_permission_confirmed,
    contains_minors, mentions_full_names, shows_injury, is_archive_content, sponsor_or_brand_visible
  ) values (
    v_pin_id, v_title, v_description, coalesce(p_story_type, 'mixed'),
    p_event_year, v_uid, nullif(trim(coalesce(p_logged_by_display_name, '')), ''),
    coalesce(p_upload_mode, 'manual_geo'), coalesce(p_risk_level, 'low'),
    'pending_review', true,
    coalesce(p_contains_minors, false),
    coalesce(p_mentions_full_names, false),
    coalesce(p_shows_injury, false),
    coalesce(p_is_archive_content, false),
    coalesce(p_sponsor_or_brand_visible, false)
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
      select id into v_tag_id
      from public.memory_tags
      where memory_map_id = p_memory_map_id and name = v_tag;
      if v_tag_id is not null then
        insert into public.memory_story_tags (story_id, tag_id)
        values (v_story_id, v_tag_id)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  perform public.create_memory_audit_log(
    p_memory_map_id, 'story_submitted', 'story', v_story_id, null,
    jsonb_build_object(
      'pin_id', v_pin_id,
      'upload_mode', p_upload_mode,
      'event_year', p_event_year
    ),
    null
  );

  return v_story_id;
end;
$$;

revoke all on function public.request_memory_map_contributor_access(uuid, text, text, boolean) from public;
grant execute on function public.request_memory_map_contributor_access(uuid, text, text, boolean) to authenticated;

revoke all on function public.redeem_memory_map_invite(text, text, text, boolean) from public;
grant execute on function public.redeem_memory_map_invite(text, text, text, boolean) to authenticated;

revoke all on function public.submit_memory_story(
  uuid, uuid, uuid, text, text, uuid, double precision, double precision, double precision, double precision,
  text, text, text, integer, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text[], jsonb
) from public;

grant execute on function public.submit_memory_story(
  uuid, uuid, uuid, text, text, uuid, double precision, double precision, double precision, double precision,
  text, text, text, integer, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text[], jsonb
) to authenticated;
