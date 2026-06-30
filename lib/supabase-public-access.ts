/**
 * Supabase views safe for anon/authenticated browser clients.
 * Base tables may hold admin-only columns; read these views from the client instead.
 */
export const SUPABASE_PUBLIC = {
  gameMatches: 'game_matches_public',
  userProfiles: 'user_profiles_public',
  userPredictionScores: 'user_prediction_scores_public',
  predictorProfiles: 'predictor_profiles_public',
} as const
