'use client'

import { NovaDemoProvider } from '@/components/advertising/NovaDemoProvider'

/** Root client providers — keeps demo activation out of server layout. */
export default function AppProviders({ children }: { children: React.ReactNode }) {
  return <NovaDemoProvider>{children}</NovaDemoProvider>
}
