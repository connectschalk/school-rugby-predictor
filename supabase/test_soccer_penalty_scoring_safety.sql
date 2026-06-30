-- Post-migration 123 safety checks for penalty shootout scoring.
-- Run manually after applying 123_fix_score_predictions_for_match_winner_correct_not_null.sql

-- 1) No NULL winner_correct rows (expect zero rows)
-- select *
-- from public.user_prediction_scores
-- where winner_correct is null;

-- 2) Penalty-draw results should store advancing team as actual_winner
-- select ups.match_id, ups.actual_winner, gm.home_score, gm.away_score, gm.penalty_winner
-- from public.user_prediction_scores ups
-- join public.game_matches gm on gm.id = ups.match_id
-- where gm.home_score = gm.away_score
--   and gm.penalty_winner is not null
--   and ups.actual_winner = 'draw';

-- 3) Re-score a completed penalty match (replace :match_id)
-- select public.score_predictions_for_match(:match_id);
