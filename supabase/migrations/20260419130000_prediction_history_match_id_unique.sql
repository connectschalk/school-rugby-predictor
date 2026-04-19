-- At most one prediction_history row per match (backfill + live insert)
create unique index if not exists prediction_history_match_id_key
  on public.prediction_history (match_id)
  where match_id is not null;
