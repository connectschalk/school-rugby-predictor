'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { absoluteMemoryMapUrl } from '@/lib/site-url'
import { logMemoryMapPublicLink } from '@/lib/memory-map/public-links'
import MemoryMapLogo from '@/components/memory-map/MemoryMapLogo'
import type { MemoryMap } from '@/lib/memory-map/types'

type Props = {
  map: MemoryMap
}

type AssetTab = 'qr' | 'poster' | 'social'

export default function ShareQrPanel({ map }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<AssetTab>('poster')
  const publicUrl = absoluteMemoryMapUrl(map.slug)
  const qrUrl = `${publicUrl}?qr=1`

  useEffect(() => {
    logMemoryMapPublicLink({
      mapId: map.id,
      mapSlug: map.slug,
      orgSlug: map.organisation?.slug,
      href: publicUrl,
    })
  }, [map.id, map.slug, map.organisation?.slug, publicUrl])

  useEffect(() => {
    void QRCode.toDataURL(qrUrl, { width: 512, margin: 2, color: { dark: '#050505', light: '#FFFFFF' } }).then(
      setQrDataUrl
    )
  }, [qrUrl])

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

  const bgStyle = map.landing_background_url
    ? { backgroundImage: `linear-gradient(rgba(5,8,13,0.55), rgba(5,8,13,0.85)), url(${map.landing_background_url})` }
    : { background: 'linear-gradient(180deg, #1a2332 0%, #05080d 100%)' }

  return (
    <div className="space-y-6">
      <p className="mm-muted text-sm">
        Download or print assets for your school pilot — QR codes, A4 posters and social share cards.
      </p>

      <div className="flex gap-2">
        {(
          [
            ['qr', 'QR only'],
            ['poster', 'A4 poster'],
            ['social', 'Social card'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${tab === id ? 'mm-btn-primary' : 'mm-btn-secondary'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'qr' ? (
        <div className="mm-card flex flex-col items-center rounded-2xl p-8">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR code" className="h-64 w-64 rounded-xl bg-white p-3" />
          ) : (
            <div className="h-64 w-64 animate-pulse rounded-xl bg-white/10" />
          )}
          <p className="mm-muted mt-4 text-center text-xs">{qrUrl}</p>
        </div>
      ) : null}

      {tab === 'poster' ? (
        <div className="mm-poster mm-share-a4 mm-card overflow-hidden rounded-2xl">
          <div className="bg-gradient-to-b from-[#1a2332] to-[#05080d] p-8 text-center print:bg-white print:text-black">
            <div className="flex flex-col items-center gap-4">
              <MemoryMapLogo map={map} className="h-16 w-16 rounded-2xl border border-white/20 bg-white p-1" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mm-text-accent print:text-gray-600">NextPlay Memory Map</p>
                <h2 className="text-2xl font-black">{map.title}</h2>
                {map.tagline ? <p className="mm-muted mt-1 text-sm print:text-gray-600">{map.tagline}</p> : null}
              </div>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="QR code" className="h-[240px] w-[240px] rounded-xl bg-white p-3" />
              ) : null}
              <p className="max-w-xs text-sm font-medium leading-relaxed text-white/90 print:text-gray-800">
                Scan to explore the stories that happened here.
              </p>
              <p className="mm-muted break-all text-[10px] print:text-gray-500">{publicUrl}</p>
              {map.sponsor_name ? (
                <div className="mt-2 flex items-center justify-center gap-2 border-t border-white/10 pt-4 print:border-gray-200">
                  <p className="text-[10px] uppercase text-white/50 print:text-gray-500">Proudly sponsored by</p>
                  {map.sponsor_logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={map.sponsor_logo_url} alt="" className="h-6 object-contain" />
                  ) : null}
                  <span className="text-xs font-bold">{map.sponsor_name}</span>
                </div>
              ) : null}
              <p className="mt-4 text-[10px] text-white/40 print:text-gray-400">NextPlay Memory Map · thenextplay.co.za</p>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'social' ? (
        <div className="mm-social-card mm-card mx-auto overflow-hidden rounded-2xl">
          <div className="relative flex aspect-square flex-col justify-end bg-cover bg-center p-6" style={bgStyle}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <MemoryMapLogo map={map} className="h-12 w-12 rounded-xl border border-white/20 bg-white p-1" />
                <div>
                  <p className="text-[10px] font-bold uppercase mm-text-accent">Memory Map</p>
                  <p className="text-lg font-black leading-tight">{map.title}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-white/90">Scan to explore the stories that happened here.</p>
              <p className="mm-muted mt-1 text-[10px]">{publicUrl}</p>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="" className="mt-3 h-20 w-20 rounded-lg bg-white p-1" />
              ) : null}
              {map.sponsor_name ? (
                <p className="mt-2 text-[10px] text-white/60">Sponsored by {map.sponsor_name}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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
