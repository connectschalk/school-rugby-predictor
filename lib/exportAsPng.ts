/**
 * Single PNG export path for Admin Social Image Studio and the public predictor.
 * Uses html-to-image with preloading so team logos embed reliably on mobile WebKit.
 */

import { toPng } from 'html-to-image'

export type ExportAsPngOptions = {
  pixelRatio?: number
  cacheBust?: boolean
  backgroundColor?: string
}

const defaultOptions: Required<ExportAsPngOptions> = {
  pixelRatio: 2,
  cacheBust: true,
  backgroundColor: '#ffffff',
}

/**
 * Wait for all &lt;img&gt; nodes to load/decode, then two animation frames for paint
 * (fixes missing logos in PNG on many mobile browsers).
 */
export async function preloadImagesInElement(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[]

  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        })
    )
  )

  await Promise.all(
    images.map((img) =>
      typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve()
    )
  )

  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )
}

export async function exportElementToPngDataUrl(
  element: HTMLElement,
  options: ExportAsPngOptions = {}
): Promise<string> {
  await preloadImagesInElement(element)
  const o = { ...defaultOptions, ...options }
  return toPng(element, {
    cacheBust: o.cacheBust,
    pixelRatio: o.pixelRatio,
    backgroundColor: o.backgroundColor,
  })
}

/**
 * Primary API: capture a DOM subtree and trigger a PNG download.
 * Throws if the element is missing or export fails (same as a failed download).
 */
export async function exportElementAsPng(
  element: HTMLElement,
  fileName: string,
  options?: ExportAsPngOptions
): Promise<void> {
  const dataUrl = await exportElementToPngDataUrl(element, options)
  const link = document.createElement('a')
  link.download = fileName
  link.href = dataUrl
  link.click()
}

/** Result style (Studio) when you prefer not to throw. */
export async function downloadPngFromElement(
  element: HTMLElement | null,
  filename: string,
  options?: ExportAsPngOptions
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!element) {
    return { ok: false, error: 'Nothing to export.' }
  }
  try {
    await exportElementAsPng(element, filename, options)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not export image.'
    return { ok: false, error: msg }
  }
}
