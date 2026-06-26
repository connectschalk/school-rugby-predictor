'use client'

type Props = {
  mode: 'geo' | 'image'
  onChange: (mode: 'geo' | 'image') => void
  showGeo: boolean
  showImage: boolean
}

export default function MapTypeToggle({ mode, onChange, showGeo, showImage }: Props) {
  if (!showGeo && !showImage) return null
  if (showGeo && !showImage) return null
  if (!showGeo && showImage) return null

  return (
    <div className="mm-card inline-flex rounded-full p-1">
      <button
        type="button"
        onClick={() => onChange('geo')}
        className={`rounded-full px-3 py-1 text-xs font-bold ${mode === 'geo' ? 'mm-btn-primary' : 'text-white/70'}`}
      >
        Geo Map
      </button>
      <button
        type="button"
        onClick={() => onChange('image')}
        className={`rounded-full px-3 py-1 text-xs font-bold ${mode === 'image' ? 'mm-btn-primary' : 'text-white/70'}`}
      >
        School Map
      </button>
    </div>
  )
}
