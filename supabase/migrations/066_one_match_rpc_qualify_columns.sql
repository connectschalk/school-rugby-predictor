-- Fully qualify column refs in one-match RPCs (avoid ambiguous id in joins/updates).

create or replace function public.get_one_match_predictions_visible(
  p_challenge_slug text,
  p_browser_token text
)
returns setof public.one_match_predictions
language sql
security definer
set search_path = public
stable
as $$
  select pr.*
  from public.one_match_predictions pr
  inner join public.one_match_challenges c on c.id = pr.challenge_id
  where c.slug = trim(p_challenge_slug)
    and c.is_active = true
    and (
      pr.is_locked = true
      or pr.browser_token = trim(coalesce(p_browser_token, ''))
    )
  order by pr.created_at asc;
$$;

create or replace function public.lock_one_match_prediction(
  p_challenge_slug text,
  p_browser_token text
)
returns table (
  id uuid,
  is_locked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
  v_kickoff timestamptz;
  v_status text;
  v_token text;
  v_id uuid;
  v_locked boolean;
begin
  v_token := trim(coalesce(p_browser_token, ''));
  if length(v_token) < 8 or length(v_token) > 200 then
    raise exception 'invalid browser token';
  end if;

  select c.id, gm.kickoff_time, gm.status
  into v_challenge_id, v_kickoff, v_status
  from public.one_match_challenges c
  join public.game_matches gm on gm.id = c.match_id
  where c.slug = trim(p_challenge_slug)
    and c.is_active = true
  limit 1;

  if v_challenge_id is null then
    raise exception 'challenge not found';
  end if;

  if v_status not in ('upcoming', 'locked') or v_kickoff <= now() then
    raise exception 'predictions closed';
  end if;

  select pr.id, pr.is_locked
  into v_id, v_locked
  from public.one_match_predictions pr
  where pr.challenge_id = v_challenge_id
    and pr.browser_token = v_token
  limit 1;

  if v_id is null then
    raise exception 'no prediction to lock';
  end if;

  if coalesce(v_locked, false) then
    return query select v_id, true;
    return;
  end if;

  update public.one_match_predictions pr
  set is_locked = true,
      updated_at = now()
  where pr.id = v_id;

  return query select v_id, true;
end;
$$;

create or replace function public.upsert_one_match_prediction(
  p_challenge_slug text,
  p_browser_token text,
  p_display_name text,
  p_predicted_winner text,
  p_predicted_margin int,
  p_ip_hash text default null
)
returns table (
  id uuid,
  duplicate_name_ip_hint boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
  v_kickoff timestamptz;
  v_status text;
  v_row_id uuid;
  v_hint boolean := false;
  v_winner text;
  v_name text;
  v_token text;
  v_existing_locked boolean;
begin
  v_name := trim(coalesce(p_display_name, ''));
  v_token := trim(coalesce(p_browser_token, ''));
  v_winner := lower(trim(coalesce(p_predicted_winner, '')));

  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'invalid display name';
  end if;
  if length(v_token) < 8 or length(v_token) > 200 then
    raise exception 'invalid browser token';
  end if;
  if v_winner not in ('home', 'away') then
    raise exception 'invalid winner';
  end if;
  if p_predicted_margin is null or p_predicted_margin < 1 or p_predicted_margin > 200 then
    raise exception 'invalid margin';
  end if;

  select c.id, gm.kickoff_time, gm.status
  into v_challenge_id, v_kickoff, v_status
  from public.one_match_challenges c
  join public.game_matches gm on gm.id = c.match_id
  where c.slug = trim(p_challenge_slug)
    and c.is_active = true
  limit 1;

  if v_challenge_id is null then
    raise exception 'challenge not found';
  end if;

  if v_status not in ('upcoming', 'locked') or v_kickoff <= now() then
    raise exception 'predictions closed';
  end if;

  select pr.is_locked
  into v_existing_locked
  from public.one_match_predictions pr
  where pr.challenge_id = v_challenge_id
    and pr.browser_token = v_token
  limit 1;

  if coalesce(v_existing_locked, false) then
    raise exception 'prediction locked';
  end if;

  if p_ip_hash is not null and length(trim(p_ip_hash)) > 0 then
    select exists (
      select 1
      from public.one_match_predictions pr2
      where pr2.challenge_id = v_challenge_id
        and lower(trim(pr2.display_name)) = lower(v_name)
        and coalesce(pr2.ip_hash, '') = trim(p_ip_hash)
        and pr2.browser_token <> v_token
    )
    into v_hint;
  end if;

  insert into public.one_match_predictions (
    challenge_id,
    display_name,
    predicted_winner,
    predicted_margin,
    browser_token,
    ip_hash,
    updated_at
  )
  values (
    v_challenge_id,
    v_name,
    v_winner,
    p_predicted_margin,
    v_token,
    nullif(trim(p_ip_hash), ''),
    now()
  )
  on conflict (challenge_id, browser_token) do update set
    display_name = excluded.display_name,
    predicted_winner = excluded.predicted_winner,
    predicted_margin = excluded.predicted_margin,
    ip_hash = coalesce(excluded.ip_hash, public.one_match_predictions.ip_hash),
    updated_at = now();

  select pr3.id into v_row_id
  from public.one_match_predictions pr3
  where pr3.challenge_id = v_challenge_id
    and pr3.browser_token = v_token;

  return query select v_row_id, coalesce(v_hint, false);
end;
$$;
