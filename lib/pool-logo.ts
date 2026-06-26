import { resolveAvatarLetter } from '@/lib/letter-avatar'

export const POOL_LOGO_BUCKET = 'pool-logos'
export const POOL_LOGO_MAX_BYTES = 2 * 1024 * 1024

export const POOL_LOGO_ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
])

export type PoolLogoSize = 'sm' | 'md' | 'lg' | 'xl'

export const POOL_LOGO_PIXELS: Record<PoolLogoSize, number> = {
  sm: 28,
  md: 36,
  lg: 48,
  xl: 96,
}

export function poolLogoInitials(name: string): string {
  return resolveAvatarLetter(null, null, name.trim() || 'Pool')
}

export function validatePoolLogoFile(file: File): string | null {
  const mime = file.type.toLowerCase()
  if (!POOL_LOGO_ALLOWED_MIME.has(mime)) {
    return 'Use a PNG, JPG, JPEG, or WebP image.'
  }
  if (file.size > POOL_LOGO_MAX_BYTES) {
    return 'Image must be 2 MB or smaller.'
  }
  return null
}

export function buildPoolLogoStoragePath(poolId: string, file: File): string {
  const ext =
    file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
        ? 'webp'
        : 'jpg'
  return `pools/${poolId}/logo-${Date.now()}.${ext}`
}

export function canShowPoolLogoUpload(canManagePool: boolean): boolean {
  return canManagePool
}
