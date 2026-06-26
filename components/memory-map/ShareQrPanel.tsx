'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { MemoryMap } from '@/lib/memory-map/types'

type Props = {
  map: MemoryMap
}

export default function ShareQrPanel({ map }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const publicUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/memory-map/${map.slug}`
      : `/memory-map/${map.slug}`

  useEffect(() => {
    void QRCode.toDataURL(publicUrl, { width: 280, margin: 2, color: { dark: '#050505', light: '#FFFFFF' } }).then(
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

  return (
    <div className="space-y-4">
      <p className="mm-muted text-sm">
        Place this QR code at entrances, pavilions, hostels or event spaces so visitors can open the Memory Map
        on-site.
      </p>
      <div className="mm-card flex flex-col items-center rounded-2xl p-6">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="QR code" className="h-[280px] w-[280px] rounded-xl bg-white p-2" />
        ) : (
          <div className="h-[280px] w-[280px] animate-pulse rounded-xl bg-white/10" />
        )}
        <p className="mm-muted mt-3 break-all text-center text-xs">{publicUrl}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyLink()} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold">
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" onClick={downloadQr} className="mm-btn-secondary rounded-xl px-4 py-2 text-sm font-bold">
          Download QR PNG
        </button>
      </div>
    </div>
  )
}
