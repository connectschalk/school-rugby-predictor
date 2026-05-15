-- Resolve one-match share links by slug for OG metadata and public pages.
-- Bypasses is_active RLS filter so archived links still resolve (slug acts as secret).

create or replace function public.get_one_match_challenge_by_slug(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := trim(coalesce(p_slug, ''));
  v_c public.one_match_challenges%rowtype;
  v_g public.game_matches%rowtype;
begin
  if length(v_slug) < 1 then
    return null;
  end if;

  select * into v_c
  from public.one_match_challenges c
  where c.slug = v_slug
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_g
  from public.game_matches gm
  where gm.id = v_c.match_id;

  if not found then
    return jsonb_build_object(
      'challenge',
      jsonb_build_object(
        'id', v_c.id,
        'slug', v_c.slug,
        'match_id', v_c.match_id,
        'is_active', v_c.is_active,
        'created_at', v_c.created_at,
        'created_by', v_c.created_by
      ),
      'match', null
    );
  end if;

  return jsonb_build_object(
    'challenge',
    jsonb_build_object(
      'id', v_c.id,
      'slug', v_c.slug,
      'match_id', v_c.match_id,
      'is_active', v_c.is_active,
      'created_at', v_c.created_at,
      'created_by', v_c.created_by
    ),
    'match',
    jsonb_build_object(
      'id', v_g.id,
      'home_team', v_g.home_team,
      'away_team', v_g.away_team,
      'kickoff_time', v_g.kickoff_time,
      'status', v_g.status,
      'home_score', v_g.home_score,
      'away_score', v_g.away_score
    )
  );
end;
$$;

revoke all on function public.get_one_match_challenge_by_slug(text) from public;
grant execute on function public.get_one_match_challenge_by_slug(text) to anon, authenticated;
