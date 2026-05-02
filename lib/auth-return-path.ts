/** Prevent open redirects: only same-site relative paths. */
export function safeInternalReturnPath(next: string | null | undefined): string | null {
  if (next == null || next === undefined) return null
  const t = String(next).trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  if (t.includes('://')) return null
  return t
}
