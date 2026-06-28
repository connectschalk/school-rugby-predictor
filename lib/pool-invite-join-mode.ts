export type PoolInviteJoinMode = 'request' | 'auto'

export function normalizePoolInviteJoinMode(value: unknown): PoolInviteJoinMode {
  return value === 'auto' ? 'auto' : 'request'
}

export function poolInviteJoinModeLabel(mode: PoolInviteJoinMode): string {
  return mode === 'auto' ? 'Join automatically' : 'Request to join'
}
