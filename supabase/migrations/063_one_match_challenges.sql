-- One Match Prediction Challenge: admin-created share link; anonymous predictions by browser_token.

create table if not exists public.one_match_challenges (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.game_matches (id) on delete cascade,
  slug text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists one_match_challenges_match_id_idx on public.one_match_challenges (match_id);
create index if not exists one_match_challenges_slug_idx on public.one_match_challenges (slug);

create table if not exists public.one_match_predictions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.one_match_challenges (id) on delete cascade,
  display_name text not null,
  predicted_winner text not null check (predicted_winner in ('home', 'away')),
  predicted_margin int not null check (predicted_margin >= 1 and predicted_margin <= 200),
  browser_token text not null,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, browser_token)
);

create index if not exists one_match_predictions_challenge_id_idx on public.one_match_predictions (challenge_id);

create or replace function public.touch_one_match_predictions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_one_match_predictions_touch on public.one_match_predictions;
create trigger trg_one_match_predictions_touch
before update on public.one_match_predictions
for each row
execute function public.touch_one_match_predictions_updated_at();

alter table public.one_match_challenges enable row level security;
alter table public.one_match_predictions enable row level security;

-- Active challenges visible to everyone (public link resolution).
drop policy if exists omc_select_active on public.one_match_challenges;
create policy omc_select_active
on public.one_match_challenges for select
to anon, authenticated
using (is_active = true);

-- Admins can list all challenges (including inactive).
drop policy if exists omc_select_admin on public.one_match_challenges;
create policy omc_select_admin
on public.one_match_challenges for select
to authenticated
using (public.is_app_admin(auth.uid()));

drop policy if exists omc_insert_admin on public.one_match_challenges;
create policy omc_insert_admin
on public.one_match_challenges for insert
to authenticated
with check (public.is_app_admin(auth.uid()));

drop policy if exists omc_update_admin on public.one_match_challenges;
create policy omc_update_admin
on public.one_match_challenges for update
to authenticated
using (public.is_app_admin(auth.uid()))
with check (public.is_app_admin(auth.uid()));

-- Predictions: read-only via client for active challenges (preview / results).
drop policy if exists omp_select_public on public.one_match_predictions;
create policy omp_select_public
on public.one_match_predictions for select
to anon, authenticated
using (
  exists (
    select 1
    from public.one_match_challenges c
    where c.id = challenge_id
      and c.is_active = true
  )
);

-- Admins can read all predictions (inactive challenges).
drop policy if exists omp_select_admin on public.one_match_predictions;
create policy omp_select_admin
on public.one_match_predictions for select
to authenticated
using (public.is_app_admin(auth.uid()));

-- Writes only through RPC (no insert/update policies on predictions).

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

  if v_status <> 'upcoming' or v_kickoff <= now() then
    raise exception 'predictions closed';
  end if;

  if p_ip_hash is not null and length(trim(p_ip_hash)) > 0 then
    select exists (
      select 1
      from public.one_match_predictions pr
      where pr.challenge_id = v_challenge_id
        and lower(trim(pr.display_name)) = lower(v_name)
        and coalesce(pr.ip_hash, '') = trim(p_ip_hash)
        and pr.browser_token <> v_token
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

  select p.id into v_row_id
  from public.one_match_predictions p
  where p.challenge_id = v_challenge_id
    and p.browser_token = v_token;

  return query select v_row_id, coalesce(v_hint, false);
end;
$$;

revoke all on function public.upsert_one_match_prediction(text, text, text, text, int, text) from public;
grant execute on function public.upsert_one_match_prediction(text, text, text, text, int, text) to anon, authenticated;

revoke insert, update, delete on public.one_match_predictions from anon, authenticated;
grant select on public.one_match_predictions to anon, authenticated;

grant select, insert, update, delete on public.one_match_challenges to authenticated;
grant select on public.one_match_challenges to anon;
