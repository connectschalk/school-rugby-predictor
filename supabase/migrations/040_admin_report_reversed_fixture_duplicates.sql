create or replace function public.admin_report_reversed_fixture_duplicates()
returns table (
  kickoff_time timestamptz,
  pair_key text,
  match_count integer,
  fixtures jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_app_admin(auth.uid()) then
    raise exception 'admin only';
  end if;

  return query
  with normalized as (
    select
      gm.id,
      gm.kickoff_time,
      gm.home_team,
      gm.away_team,
      public.normalize_team_name_for_preview(gm.home_team) as home_norm,
      public.normalize_team_name_for_preview(gm.away_team) as away_norm
    from public.game_matches gm
    where gm.status <> 'cancelled'
  ),
  grouped as (
    select
      n.kickoff_time,
      least(n.home_norm, n.away_norm) || '|' || greatest(n.home_norm, n.away_norm) as pair_key,
      count(*)::int as match_count,
      count(distinct (n.home_norm || '|' || n.away_norm)) as ordered_variants,
      jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'home_team', n.home_team,
          'away_team', n.away_team
        )
        order by n.id
      ) as fixtures
    from normalized n
    group by
      n.kickoff_time,
      least(n.home_norm, n.away_norm) || '|' || greatest(n.home_norm, n.away_norm)
    having count(*) > 1
       and count(distinct (n.home_norm || '|' || n.away_norm)) > 1
  )
  select
    g.kickoff_time,
    g.pair_key,
    g.match_count,
    g.fixtures
  from grouped g
  order by g.kickoff_time asc, g.pair_key asc;
end;
$$;

revoke all on function public.admin_report_reversed_fixture_duplicates() from public;
grant execute on function public.admin_report_reversed_fixture_duplicates() to authenticated;
