import { buildPoolShareDescription, buildPoolShareTitle } from '@/lib/pool-og'

export type PoolSharePayload = {
  title: string
  text: string
  url: string
}

export type PoolShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

export function buildPoolSharePayload(
  poolName: string,
  competitionName: string,
  shareUrl: string
): PoolSharePayload {
  return {
    title: buildPoolShareTitle(poolName),
    text: buildPoolShareDescription(competitionName),
    url: shareUrl,
  }
}

export function formatPoolShareClipboardText(payload: PoolSharePayload): string {
  return `${payload.title}\n\n${payload.text}\n\n${payload.url}`
}

export function canUseWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export async function sharePoolInvite(payload: PoolSharePayload): Promise<PoolShareResult> {
  if (canUseWebShare()) {
    const shareData: ShareData = {
      title: payload.title,
      text: payload.text,
      url: payload.url,
    }

    try {
      await navigator.share(shareData)
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled'
      }
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(formatPoolShareClipboardText(payload))
      return 'copied'
    } catch {
      return 'failed'
    }
  }

  return 'failed'
}
