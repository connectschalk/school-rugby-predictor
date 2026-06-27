'use client'

import { useCallback, useState } from 'react'

export type MemoryMapGeolocationStatus = 'idle' | 'loading' | 'success' | 'error' | 'denied'

export type MemoryMapGeolocationCoords = {
  lat: number
  lng: number
}

export const MEMORY_MAP_GEOLOCATION_UNAVAILABLE_MESSAGE =
  'Location not available. You can still explore the map.'

export function geolocationFailureStatus(code: number): MemoryMapGeolocationStatus {
  return code === 1 ? 'denied' : 'error'
}

export function useMemoryMapGeolocation() {
  const [location, setLocation] = useState<MemoryMapGeolocationCoords | null>(null)
  const [status, setStatus] = useState<MemoryMapGeolocationStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const clear = useCallback(() => {
    setLocation(null)
    setStatus('idle')
    setMessage(null)
  }, [])

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocation(null)
      setStatus('error')
      setMessage(MEMORY_MAP_GEOLOCATION_UNAVAILABLE_MESSAGE)
      return
    }

    setStatus('loading')
    setMessage(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('success')
        setMessage(null)
      },
      (err) => {
        setLocation(null)
        setStatus(geolocationFailureStatus(err.code))
        setMessage(MEMORY_MAP_GEOLOCATION_UNAVAILABLE_MESSAGE)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }, [])

  return { location, status, message, locate, clear }
}
