-- Hard-delete pools (admin or app admin). Cascades memberships, join requests, groups, teams, matches, comments.
-- Does not touch user_predictions, user_prediction_scores, game_matches, or competitions.

create or replace function public.delete_pool(p_pool_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_allowed boolean;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select
    public.is_app_admin(v_uid)
    or exists (
      select 1
      from public.pools p
      where p.id = p_pool_id
        and p.admin_user_id = v_uid
    )
  into v_allowed;

  if not coalesce(v_allowed, false) then
    raise exception 'permission denied';
  end if;

  delete from public.pools
  where id = p_pool_id;

  if not found then
    raise exception 'pool not found';
  end if;
end;
$$;

revoke all on function public.delete_pool(uuid) from public;
grant execute on function public.delete_pool(uuid) to authenticated;
