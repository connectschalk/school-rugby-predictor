-- One Match preview ordering:
-- home picks first by largest margin (more negative), then away picks by margin.
-- Locked-only preview rows.

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
    and pr.is_locked = true
  order by
    case
      when pr.predicted_winner = 'home' then -pr.predicted_margin
      else pr.predicted_margin
    end asc,
    pr.created_at asc;
$$;
