/** Detect Next.js `notFound()` / `redirect()` control-flow errors so layouts can rethrow them. */
export function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const digest = 'digest' in err ? String((err as { digest?: string }).digest ?? '') : ''
  return digest.startsWith('NEXT_NOT_FOUND') || digest.startsWith('NEXT_REDIRECT')
}
