-- Audit pool leaderboard scoring for "Die BUKSEM groepie".
-- Run in Supabase SQL editor (read-only sections first, then rescore if needed).
--
-- Column names in this schema:
--   game_matches: home_score, away_score, penalty_winner
--   user_predictions: predicted_home_score, predicted_away_score, predicted_penalty_winner

-- =============================================================================
-- 0. Resolve pool and scope
-- =============================================================================

select id as pool_id, name, competition_id, created_at
from public.pools
where name ilike 'Die BUKSEM groepie';

-- Members
select pm.user_id,
       coalesce(nullif(trim(up.display_name), ''), 'Player') as player_name,
       pm.joined_at,
       pm.role
from public.pool_members pm
join public.pools p on p.id = pm.pool_id
left join public.user_profiles up on up.id = pm.user_id
where p.name ilike 'Die BUKSEM groepie'
order by pm.joined_at;

-- Pool matches (explicit picks) vs effective matches (leaderboard scope)
select 'pool_matches' as source, pm.match_id, gm.home_team, gm.away_team, gm.status, gm.kickoff_time
from public.pool_matches pm
join public.pools p on p.id = pm.pool_id
join public.game_matches gm on gm.id = pm.match_id
where p.name ilike 'Die BUKSEM groepie'
union all
select 'pool_effective_matches' as source, em.match_id, gm.home_team, gm.away_team, gm.status, gm.kickoff_time
from public.pools p
cross join lateral public.pool_effective_matches(p.id, null) em
join public.game_matches gm on gm.id = em.match_id
where p.name ilike 'Die BUKSEM groepie'
order by kickoff_time, source;

-- =============================================================================
-- 1. Migration / schema checks (121, 122, 123)
-- =============================================================================

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_predictions'
      and column_name = 'predicted_penalty_winner'
  ) as migration_121_predicted_penalty_winner,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'game_matches'
      and column_name = 'penalty_winner'
  ) as migration_121_penalty_winner,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'score_predictions_for_match'
      and pg_get_functiondef(p.oid) ilike '%predicted_penalty_winner is not null%'
      and pg_get_functiondef(p.oid) ilike '%case%when up.predicted_penalty_winner is not null then%'
      and pg_get_functiondef(p.oid) not ilike '%up.predicted_penalty_winner in (%v_penalty_winner%'
  ) as migration_123_explicit_winner_correct_case;

-- =============================================================================
-- 2. Safety: winner_correct must never be NULL
-- =============================================================================

select ups.*
from public.user_prediction_scores ups
join public.pool_members pm on pm.user_id = ups.user_id
join public.pools p on p.id = pm.pool_id
where p.name ilike 'Die BUKSEM groepie'
  and ups.winner_correct is null;

-- =============================================================================
-- 3. Per-player per completed pool match audit (expected vs stored)
-- =============================================================================

with pool_ctx as (
  select p.id as pool_id, p.competition_id
  from public.pools p
  where p.name ilike 'Die BUKSEM groepie'
  limit 1
),
effective as (
  select em.match_id
  from pool_ctx pc
  cross join lateral public.pool_effective_matches(pc.pool_id, null) em
),
completed_matches as (
  select gm.*
  from effective e
  join public.game_matches gm on gm.id = e.match_id
  where gm.status in ('completed', 'final', 'finished')
    and gm.home_score is not null
    and gm.away_score is not null
),
members as (
  select pm.user_id,
         pm.joined_at,
         coalesce(nullif(trim(up.display_name), ''), 'Player') as player_name
  from pool_ctx pc
  join public.pool_members pm on pm.pool_id = pc.pool_id
  left join public.user_profiles up on up.id = pm.user_id
),
grid as (
  select m.user_id,
         m.player_name,
         m.joined_at,
         cm.id as match_id,
         cm.home_team,
         cm.away_team,
         cm.home_score,
         cm.away_score,
         cm.penalty_winner,
         cm.kickoff_time
  from members m
  cross join completed_matches cm
),
scored as (
  select
    g.*,
    up.id as prediction_id,
    up.predicted_home_score,
    up.predicted_away_score,
    up.predicted_penalty_winner,
    up.predicted_winner,
    up.is_locked,
    up.locked_at,
    ups.total_points as stored_points,
    ups.winner_correct as stored_winner_correct,
    ups.margin_difference as stored_margin_difference,
    ups.scored_at,
    case
      when cm.home_score > cm.away_score then 'home'
      when cm.away_score > cm.home_score then 'away'
      else 'draw'
    end as actual_winner
  from grid g
  join completed_matches cm on cm.id = g.match_id
  left join public.user_predictions up
    on up.user_id = g.user_id
   and up.match_id = g.match_id
   and up.predicted_home_score is not null
   and up.predicted_away_score is not null
  left join public.user_prediction_scores ups
    on ups.prediction_id = up.id
),
expected as (
  select
    s.*,
    case
      when s.prediction_id is null then null
      when s.actual_winner = 'draw' and s.penalty_winner in ('home', 'away') then
        case
          when s.predicted_penalty_winner is not null then
            s.predicted_penalty_winner = s.penalty_winner
          when s.predicted_winner is not null then
            s.predicted_winner in ('home', 'away')
            and s.predicted_winner = s.penalty_winner
          else false
        end
      else
        coalesce(
          (
            case
              when s.predicted_home_score > s.predicted_away_score then 'home'
              when s.predicted_away_score > s.predicted_home_score then 'away'
              else 'draw'
            end
          ) = s.actual_winner,
          false
        )
    end as expected_winner_correct,
    (
      case
        when s.prediction_id is null then null
        when s.actual_winner = 'draw' and s.penalty_winner in ('home', 'away') then
          case
            when s.predicted_home_score = s.home_score
                 and s.predicted_away_score = s.away_score
                 and s.predicted_penalty_winner is not null
                 and s.predicted_penalty_winner = s.penalty_winner then 3.0
            when s.predicted_penalty_winner is not null
                 and s.predicted_penalty_winner = s.penalty_winner then 2.0
            when s.predicted_home_score = s.home_score
                 and s.predicted_away_score = s.away_score
                 and s.predicted_penalty_winner is null then 2.0
            when s.predicted_penalty_winner is null
                 and s.predicted_winner in ('home', 'away')
                 and s.predicted_winner = s.penalty_winner then 2.0
            when s.predicted_home_score = s.home_score
                 and s.predicted_away_score = s.away_score
                 and s.predicted_penalty_winner is not null
                 and s.predicted_penalty_winner is distinct from s.penalty_winner then 1.0
            when (
              case
                when s.predicted_home_score > s.predicted_away_score then 'home'
                when s.predicted_away_score > s.predicted_home_score then 'away'
                else 'draw'
              end
            ) is distinct from s.actual_winner then 0.0
            when abs(s.predicted_home_score - s.home_score)
                 + abs(s.predicted_away_score - s.away_score) <= 1 then 2.0
            when (s.predicted_home_score - s.predicted_away_score) = (s.home_score - s.away_score) then
              case
                when s.actual_winner = 'draw'
                  and abs(s.predicted_home_score - s.home_score) <= 1
                  and abs(s.predicted_away_score - s.away_score) <= 1 then 2.0
                when s.actual_winner = 'draw' then 1.0
                else 2.0
              end
            else 1.0
          end
        when s.predicted_home_score = s.home_score
             and s.predicted_away_score = s.away_score then 3.0
        when (
          case
            when s.predicted_home_score > s.predicted_away_score then 'home'
            when s.predicted_away_score > s.predicted_home_score then 'away'
            else 'draw'
          end
        ) is distinct from s.actual_winner then 0.0
        when abs(s.predicted_home_score - s.home_score)
             + abs(s.predicted_away_score - s.away_score) <= 1 then 2.0
        when (s.predicted_home_score - s.predicted_away_score) = (s.home_score - s.away_score) then
          case
            when s.actual_winner = 'draw'
              and abs(s.predicted_home_score - s.home_score) <= 1
              and abs(s.predicted_away_score - s.away_score) <= 1 then 2.0
            when s.actual_winner = 'draw' then 1.0
            else 2.0
          end
        else 1.0
      end
    )::numeric(4,1) as expected_points
  from scored s
),
audited as (
  select
    e.player_name,
    e.user_id,
    e.prediction_id,
    e.match_id,
    e.home_team,
    e.away_team,
    e.home_score || '-' || e.away_score as actual_score,
    e.penalty_winner,
    e.predicted_home_score || '-' || e.predicted_away_score as predicted_score,
    e.predicted_penalty_winner,
    e.stored_points,
    e.stored_winner_correct,
    e.expected_points,
    e.expected_winner_correct,
    e.is_locked,
    e.joined_at,
    e.scored_at,
    e.kickoff_time,
  case
    when e.prediction_id is null then 'no prediction'
    when e.is_locked is not true then 'prediction not locked'
    when e.scored_at is null then 'missing user_prediction_scores row'
    when e.scored_at < e.joined_at then 'score before pool join (excluded from leaderboard)'
    when e.stored_points is distinct from e.expected_points
         and e.stored_winner_correct is distinct from e.expected_winner_correct
      then 'points and winner_correct mismatch'
    when e.stored_points is distinct from e.expected_points then 'points mismatch'
    when e.stored_winner_correct is distinct from e.expected_winner_correct then 'winner_correct mismatch'
    when e.stored_winner_correct is null then 'stored winner_correct is null'
    else null
  end as mismatch_reason
  from expected e
)
select *
from audited
order by player_name, kickoff_time;

-- Mismatches only
with pool_ctx as (
  select p.id as pool_id from public.pools p where p.name ilike 'Die BUKSEM groepie' limit 1
),
effective as (
  select em.match_id from pool_ctx pc cross join lateral public.pool_effective_matches(pc.pool_id, null) em
),
completed_matches as (
  select gm.* from effective e join public.game_matches gm on gm.id = e.match_id
  where gm.status in ('completed', 'final', 'finished') and gm.home_score is not null and gm.away_score is not null
),
members as (
  select pm.user_id, pm.joined_at, coalesce(nullif(trim(up.display_name), ''), 'Player') as player_name
  from pool_ctx pc join public.pool_members pm on pm.pool_id = pc.pool_id
  left join public.user_profiles up on up.id = pm.user_id
),
grid as (
  select m.user_id, m.player_name, m.joined_at, cm.id as match_id, cm.home_team, cm.away_team,
         cm.home_score, cm.away_score, cm.penalty_winner, cm.kickoff_time
  from members m cross join completed_matches cm
),
scored as (
  select g.*, up.id as prediction_id, up.predicted_home_score, up.predicted_away_score,
         up.predicted_penalty_winner, up.predicted_winner, up.is_locked,
         ups.total_points as stored_points, ups.winner_correct as stored_winner_correct, ups.scored_at,
         case when cm.home_score > cm.away_score then 'home' when cm.away_score > cm.home_score then 'away' else 'draw' end as actual_winner
  from grid g join completed_matches cm on cm.id = g.match_id
  left join public.user_predictions up on up.user_id = g.user_id and up.match_id = g.match_id
    and up.predicted_home_score is not null and up.predicted_away_score is not null
  left join public.user_prediction_scores ups on ups.prediction_id = up.id
),
expected as (
  select s.*,
    case when s.prediction_id is null then null
      when s.actual_winner = 'draw' and s.penalty_winner in ('home', 'away') then
        case when s.predicted_penalty_winner is not null then s.predicted_penalty_winner = s.penalty_winner
             when s.predicted_winner is not null then s.predicted_winner in ('home','away') and s.predicted_winner = s.penalty_winner
             else false end
      else coalesce((case when s.predicted_home_score > s.predicted_away_score then 'home' when s.predicted_away_score > s.predicted_home_score then 'away' else 'draw' end) = s.actual_winner, false)
    end as expected_winner_correct,
    (case when s.prediction_id is null then null
      when s.actual_winner = 'draw' and s.penalty_winner in ('home', 'away') then
        case when s.predicted_home_score = s.home_score and s.predicted_away_score = s.away_score and s.predicted_penalty_winner is not null and s.predicted_penalty_winner = s.penalty_winner then 3.0
             when s.predicted_penalty_winner is not null and s.predicted_penalty_winner = s.penalty_winner then 2.0
             when s.predicted_home_score = s.home_score and s.predicted_away_score = s.away_score and s.predicted_penalty_winner is null then 2.0
             when s.predicted_penalty_winner is null and s.predicted_winner in ('home','away') and s.predicted_winner = s.penalty_winner then 2.0
             when s.predicted_home_score = s.home_score and s.predicted_away_score = s.away_score and s.predicted_penalty_winner is not null and s.predicted_penalty_winner is distinct from s.penalty_winner then 1.0
             when (case when s.predicted_home_score > s.predicted_away_score then 'home' when s.predicted_away_score > s.predicted_home_score then 'away' else 'draw' end) is distinct from s.actual_winner then 0.0
             when abs(s.predicted_home_score - s.home_score) + abs(s.predicted_away_score - s.away_score) <= 1 then 2.0
             when (s.predicted_home_score - s.predicted_away_score) = (s.home_score - s.away_score) then case when s.actual_winner = 'draw' and abs(s.predicted_home_score - s.home_score) <= 1 and abs(s.predicted_away_score - s.away_score) <= 1 then 2.0 when s.actual_winner = 'draw' then 1.0 else 2.0 end
             else 1.0 end
      when s.predicted_home_score = s.home_score and s.predicted_away_score = s.away_score then 3.0
      when (case when s.predicted_home_score > s.predicted_away_score then 'home' when s.predicted_away_score > s.predicted_home_score then 'away' else 'draw' end) is distinct from s.actual_winner then 0.0
      when abs(s.predicted_home_score - s.home_score) + abs(s.predicted_away_score - s.away_score) <= 1 then 2.0
      when (s.predicted_home_score - s.predicted_away_score) = (s.home_score - s.away_score) then case when s.actual_winner = 'draw' and abs(s.predicted_home_score - s.home_score) <= 1 and abs(s.predicted_away_score - s.away_score) <= 1 then 2.0 when s.actual_winner = 'draw' then 1.0 else 2.0 end
      else 1.0
    end)::numeric(4,1) as expected_points
  from scored s
)
select player_name, user_id, prediction_id, match_id, home_team, away_team,
       home_score || '-' || away_score as actual_score, penalty_winner,
       predicted_home_score || '-' || predicted_away_score as predicted_score, predicted_penalty_winner,
       stored_points, stored_winner_correct, expected_points, expected_winner_correct,
       case when prediction_id is null then 'no prediction'
            when is_locked is not true then 'prediction not locked'
            when scored_at is null then 'missing user_prediction_scores row'
            when scored_at < joined_at then 'score before pool join (excluded from leaderboard)'
            when stored_points is distinct from expected_points and stored_winner_correct is distinct from expected_winner_correct then 'points and winner_correct mismatch'
            when stored_points is distinct from expected_points then 'points mismatch'
            when stored_winner_correct is distinct from expected_winner_correct then 'winner_correct mismatch'
            when stored_winner_correct is null then 'stored winner_correct is null'
       end as mismatch_reason
from expected
where case when prediction_id is null then 'no prediction'
           when is_locked is not true then 'prediction not locked'
           when scored_at is null then 'missing user_prediction_scores row'
           when scored_at < joined_at then 'score before pool join (excluded from leaderboard)'
           when stored_points is distinct from expected_points then 'mismatch'
           when stored_winner_correct is distinct from expected_winner_correct then 'mismatch'
           when stored_winner_correct is null then 'mismatch'
      end is not null
  and case when prediction_id is null then 'no prediction'
           when is_locked is not true then 'prediction not locked'
           when scored_at is null then 'missing user_prediction_scores row'
           when scored_at < joined_at then 'score before pool join (excluded from leaderboard)'
           when stored_points is distinct from expected_points then 'mismatch'
           when stored_winner_correct is distinct from expected_winner_correct then 'mismatch'
           when stored_winner_correct is null then 'mismatch'
      end not in ('score before pool join (excluded from leaderboard)')
order by player_name, kickoff_time;

-- =============================================================================
-- 4. Leaderboard totals: RPC vs independent aggregation from expected scores
-- =============================================================================

with pool_ctx as (
  select p.id as pool_id from public.pools p where p.name ilike 'Die BUKSEM groepie' limit 1
),
rpc as (
  select pl.user_id, pl.display_name, pl.total_points, pl.correct_winners, pl.games_predicted,
         pl.average_margin_difference, pl.margin_points_total
  from pool_ctx pc
  cross join lateral public.pool_leaderboard(pc.pool_id, null) pl
),
effective as (
  select em.match_id from pool_ctx pc cross join lateral public.pool_effective_matches(pc.pool_id, null) em
),
completed_matches as (
  select gm.id from effective e join public.game_matches gm on gm.id = e.match_id
  where gm.status in ('completed', 'final', 'finished')
),
members as (
  select pm.user_id, pm.joined_at, coalesce(nullif(trim(up.display_name), ''), 'Player') as display_name
  from pool_ctx pc join public.pool_members pm on pm.pool_id = pc.pool_id
  left join public.user_profiles up on up.id = pm.user_id
),
stored_agg as (
  select m.user_id,
         coalesce(sum(ups.total_points), 0)::numeric as calc_total_points,
         coalesce(sum(case when ups.winner_correct then 1 else 0 end), 0)::bigint as calc_correct_winners,
         coalesce(count(ups.prediction_id), 0)::bigint as calc_games_predicted,
         coalesce(avg(ups.margin_difference::numeric), null) as calc_avg_margin_difference,
         coalesce(sum(ups.margin_points), 0)::numeric as calc_margin_points_total
  from members m
  left join public.user_prediction_scores ups
    on ups.user_id = m.user_id
   and ups.match_id in (select id from completed_matches)
   and ups.scored_at >= m.joined_at
  group by m.user_id
)
select r.display_name,
       r.user_id,
       r.total_points as rpc_total_points,
       s.calc_total_points,
       r.correct_winners as rpc_correct_winners,
       s.calc_correct_winners,
       r.games_predicted as rpc_games_predicted,
       s.calc_games_predicted,
       r.average_margin_difference as rpc_avg_margin_difference,
       s.calc_avg_margin_difference,
       r.margin_points_total as rpc_margin_points,
       s.calc_margin_points_total,
       case
         when r.total_points is distinct from s.calc_total_points then 'total_points mismatch'
         when r.correct_winners is distinct from s.calc_correct_winners then 'correct_winners mismatch'
         when r.games_predicted is distinct from s.calc_games_predicted then 'games_predicted mismatch'
         when r.average_margin_difference is distinct from s.calc_avg_margin_difference then 'avg_margin mismatch'
         when r.margin_points_total is distinct from s.calc_margin_points_total then 'margin_points mismatch'
         else 'ok'
       end as leaderboard_check
from rpc r
join stored_agg s on s.user_id = r.user_id
order by r.total_points desc, r.display_name;

-- =============================================================================
-- 5. Safe manual rescore for this pool only (run after migrations 121–123)
-- =============================================================================
-- Replace pool name filter or paste pool_id from section 0.

/*
select public.score_predictions_for_match(gm.id) as predictions_scored, gm.id as match_id, gm.home_team, gm.away_team
from public.pool_matches pm
join public.pools p on p.id = pm.pool_id
join public.game_matches gm on gm.id = pm.match_id
where p.name ilike 'Die BUKSEM groepie'
  and gm.status in ('completed', 'final', 'finished');
*/

-- Or with explicit pool_id:
/*
select public.score_predictions_for_match(gm.id)
from public.pool_matches pm
join public.game_matches gm on gm.id = pm.match_id
where pm.pool_id = '<POOL_ID>'
  and gm.status in ('completed', 'final', 'finished');
*/

-- Re-run section 2 after rescore (expect zero rows):
-- select * from public.user_prediction_scores where winner_correct is null;
