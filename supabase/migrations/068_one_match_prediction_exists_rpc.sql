-- Check whether this browser token already has a one-match prediction row for a challenge.
-- Used by the lock button flow before calling lock_one_match_prediction.

create or replace function public.one_match_prediction_exists(
  p_challenge_slug text,
  p_browser_token text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.one_match_predictions p
    inner join public.one_match_challenges c on c.id = p.challenge_id
    where c.slug = trim(p_challenge_slug)
      and c.is_active = true
      and p.browser_token = trim(coalesce(p_browser_token, ''))
  );
$$;

revoke all on function public.one_match_prediction_exists(text, text) from public;
grant execute on function public.one_match_prediction_exists(text, text) to anon, authenticated;
