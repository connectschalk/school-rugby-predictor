'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { MemoryMap } from '@/lib/memory-map/types'

type Props = {
  map: MemoryMap
}

function resolvePublicUrl(slug: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/memory-map/${slug}`
  }
  return `https://www.thenextplay.co.za/memory-map/${slug}`
}

export default function ShareQrPanel({ map }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const posterRef = useRef<HTMLDivElement>(null)
  const publicUrl = resolvePublicUrl(map.slug)

  useEffect(() => {
    void QRCode.toDataURL(publicUrl, { width: 320, margin: 2, color: { dark: '#050505', light: '#FFFFFF' } }).then(
      setQrDataUrl
    )
  }, [publicUrl])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  function downloadQr() {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `${map.slug}-memory-map-qr.png`
    a.click()
  }

  function printPoster() {
    window.print()
  }

  return (
    <div className="space-y-6">
      <p className="mm-muted text-sm">
        Place this QR code at entrances, pavilions, hostels or event spaces so visitors can open the Memory Map on-site.
      </p>

      <div ref={posterRef} className="mm-poster mm-card overflow-hidden rounded-2xl">
        <div className="bg-gradient-to-b from-[#1a2332] to-[#05080d] p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            {map.profile_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={map.profile_image_url} alt="" className="h-16 w-16 rounded-2xl object-cover border border-white/20" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-xl font-black text-[var(--mm-accent)]">NP</div>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--mm-accent)]">Memory Map</p>
              <h2 className="text-2xl font-black">{map.title}</h2>
              {map.tagline ? <p className="mm-muted mt-1 text-sm">{map.tagline}</p> : null}
            </div>
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR code" className="h-[240px] w-[240px] rounded-xl bg-white p-3" />
            ) : (
              <div className="h-[240px] w-[240px] animate-pulse rounded-xl bg-white/10" />
            )}
            <p className="max-w-xs text-sm font-medium leading-relaxed text-white/90">
              Scan to explore the stories that happened here.
            </p>
            <p className="mm-muted break-all text-[10px]">{publicUrl}</p>
            {map.sponsor_name ? (
              <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-4">
                <p className="text-[10px] uppercase text-white/50">Proudly sponsored by</p>
                {map.sponsor_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={map.sponsor_logo_url} alt="" className="h-6 object-contain" />
                ) : null}
                <span className="text-xs font-bold">{map.sponsor_name}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyLink()} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold">
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" onClick={downloadQr} className="mm-btn-secondary rounded-xl px-4 py-2 text-sm font-bold">
          Download QR PNG
        </button>
        <button type="button" onClick={printPoster} className="mm-btn-secondary rounded-xl px-4 py-2 text-sm font-bold">
          Print poster
        </button>
      </div>
    </div>
  )
}
