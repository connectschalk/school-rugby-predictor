import './memory-map.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'NextPlay Memory Map',
  description: 'Every place has a story. Capture it where it happened.',
  robots: { index: false, follow: false },
}

export default function MemoryMapLayout({ children }: { children: React.ReactNode }) {
  return <div className="mm-root">{children}</div>
}
