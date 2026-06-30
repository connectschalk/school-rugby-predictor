/** One-time random password for signUp when the user sets their real password after email confirmation. */
export function createSignupPlaceholderPassword(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `Np!${crypto.randomUUID()}${crypto.randomUUID()}`
  }
  return `Np!${Math.random().toString(36).slice(2)}${Date.now()}`
}
