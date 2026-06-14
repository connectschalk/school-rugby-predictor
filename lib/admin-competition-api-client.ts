'use client'

import {
  formatKickoffJohannesburg,
  fromAdminJohannesburgInput,
  isKickoffTodayJohannesburg,
  toAdminJohannesburgInput,
} from '@/lib/admin-kickoff-johannesburg'
import { supabase } from '@/lib/supabase'

export {
  fromAdminJohannesburgInput,
  toAdminJohannesburgInput,
} from '@/lib/admin-kickoff-johannesburg'

export async function adminCompetitionApiToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export async function adminCompetitionFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await adminCompetitionApiToken()
  if (!token) throw new Error('Not signed in')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(path, { ...init, headers })
}

/** UTC ISO → datetime-local value in Africa/Johannesburg. */
export function isoToDatetimeLocalInput(iso: string): string {
  return toAdminJohannesburgInput(iso)
}

export function formatKickoffDisplay(iso: string): string {
  return formatKickoffJohannesburg(iso)
}

export function isKickoffToday(iso: string): boolean {
  return isKickoffTodayJohannesburg(iso)
}
