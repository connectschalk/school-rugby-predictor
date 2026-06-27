-- Own-story approval: block self-approval for contributor submissions unless platform admin.

create or replace function public.approve_memory_story(
  p_story_id uuid,
  p_approval_note text default null
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
  v_pin public.memory_pins;
  v_admin_created boolean;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_story from public.memory_stories where id = p_story_id;
  if not found then raise exception 'story not found'; end if;

  v_admin_created := coalesce((v_story.governance_flags->>'admin_created')::boolean, false);

  if v_story.uploaded_by = v_uid
     and not public.is_app_admin(v_uid)
     and not v_admin_created then
    raise exception 'You submitted this memory. Another admin must approve it before it appears publicly.';
  end if;

  v_map_id := public.memory_map_id_for_pin(v_story.pin_id);
  if not public.is_memory_map_admin(v_map_id, v_uid) then raise exception 'forbidden'; end if;

  update public.memory_stories
  set status = 'approved', approved_by = v_uid, approved_at = now(),
      approval_note = nullif(trim(coalesce(p_approval_note, '')), ''),
      updated_at = now()
  where id = p_story_id;

  select * into v_pin from public.memory_pins where id = v_story.pin_id;
  if v_pin.status = 'pending' then
    update public.memory_pins set status = 'approved', updated_by = v_uid, updated_at = now()
    where id = v_pin.id;
  end if;

  perform public.create_memory_audit_log(
    v_map_id, 'story_approved', 'story', p_story_id,
    to_jsonb(v_story), jsonb_build_object('status', 'approved', 'note', p_approval_note),
    p_approval_note
  );
end;
$$;

revoke all on function public.approve_memory_story(uuid, text) from public;
grant execute on function public.approve_memory_story(uuid, text) to authenticated;

notify pgrst, 'reload schema';
