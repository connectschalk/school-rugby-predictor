/** Fetch a public image and inline as a data URL for Satori / ImageResponse (Facebook-safe). */
export async function fetchImageAsDataUrl(url: string, timeoutMs = 4000): Promise<string | null> {
  const trimmed = url?.trim()
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(trimmed, {
      signal: controller.signal,
      headers: { Accept: 'image/*' },
      cache: 'force-cache',
    })
    if (!res.ok) return null

    const contentType = (res.headers.get('content-type') ?? 'image/png').split(';')[0]!.trim()
    if (!contentType.startsWith('image/')) return null

    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > 2 * 1024 * 1024) return null

    const base64 = arrayBufferToBase64(buf)
    return `data:${contentType};base64,${base64}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/** Read a file from /public for OG generation at build time (no network). */
export async function readPublicImageAsDataUrl(publicPath: string): Promise<string | null> {
  const relative = publicPath.replace(/^\//, '')
  try {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const buf = await readFile(join(process.cwd(), 'public', relative))
    const ext = relative.split('.').pop()?.toLowerCase()
    const mime =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
