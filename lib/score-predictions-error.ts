import type { PostgrestError } from '@supabase/supabase-js'

export type ScorePredictionsRpcError = {
  message: string
  code?: string
  details?: string
  hint?: string
}

export function scorePredictionsRpcErrorFromPostgrest(
  error: PostgrestError
): ScorePredictionsRpcError {
  return {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  }
}

export function logScorePredictionsFailure(
  context: Record<string, unknown>,
  error: ScorePredictionsRpcError
): void {
  console.error('[score-predictions-for-match]', {
    ...context,
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  })
}

export function scorePredictionsErrorFields(
  error: ScorePredictionsRpcError,
  options: { includeDevFields?: boolean } = {}
): Record<string, string | undefined> {
  const includeDev = options.includeDevFields ?? process.env.NODE_ENV === 'development'
  return {
    scoring_error: error.message,
    ...(includeDev
      ? {
          scoring_error_code: error.code,
          scoring_error_details: error.details,
          scoring_error_hint: error.hint,
        }
      : {}),
  }
}
