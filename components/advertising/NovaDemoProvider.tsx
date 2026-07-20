'use client'

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import {
  DEMO_REGION_STORAGE_KEY,
  type DemoRegion,
} from '@/lib/advertising/placements'
import {
  getNovaDemoBranding,
  isNovaDemoEnvEnabled,
  isNovaDemoQueryAllowed,
  type NovaDemoBranding,
} from '@/lib/nova-demo'

type NovaDemoContextValue = {
  enabled: boolean
  branding: NovaDemoBranding
  region: DemoRegion
  setRegion: (region: DemoRegion) => void
}

const NovaDemoContext = createContext<NovaDemoContextValue>({
  enabled: false,
  branding: getNovaDemoBranding(),
  region: 'national',
  setRegion: () => {},
})

function readQueryDemo(): boolean {
  if (typeof window === 'undefined') return false
  if (!isNovaDemoQueryAllowed()) return false
  const params = new URLSearchParams(window.location.search)
  const flag = params.get('novaDemo')
  return flag === '1' || flag === 'true'
}

function readDemoEnabled(): boolean {
  return isNovaDemoEnvEnabled() || readQueryDemo()
}

function readStoredRegion(): DemoRegion {
  if (typeof window === 'undefined') return 'national'
  try {
    const raw = sessionStorage.getItem(DEMO_REGION_STORAGE_KEY)
    if (
      raw === 'boland' ||
      raw === 'northern_suburbs' ||
      raw === 'lowveld' ||
      raw === 'national'
    ) {
      return raw
    }
  } catch {
    /* ignore */
  }
  return 'national'
}

const regionListeners = new Set<() => void>()

function emitRegionChange() {
  regionListeners.forEach((l) => l())
}

function subscribeRegion(onStoreChange: () => void) {
  regionListeners.add(onStoreChange)
  return () => {
    regionListeners.delete(onStoreChange)
  }
}

function subscribeDemoEnabled(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const onPop = () => onStoreChange()
  window.addEventListener('popstate', onPop)
  return () => window.removeEventListener('popstate', onPop)
}

export function NovaDemoProvider({ children }: { children: React.ReactNode }) {
  const enabled = useSyncExternalStore(subscribeDemoEnabled, readDemoEnabled, isNovaDemoEnvEnabled)
  const region = useSyncExternalStore(subscribeRegion, readStoredRegion, () => 'national' as DemoRegion)

  const setRegion = useCallback((next: DemoRegion) => {
    try {
      sessionStorage.setItem(DEMO_REGION_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    emitRegionChange()
  }, [])

  const value = useMemo(
    () => ({
      enabled,
      branding: getNovaDemoBranding(),
      region,
      setRegion,
    }),
    [enabled, region, setRegion]
  )

  return <NovaDemoContext.Provider value={value}>{children}</NovaDemoContext.Provider>
}

export function useNovaDemo(): NovaDemoContextValue {
  return useContext(NovaDemoContext)
}
