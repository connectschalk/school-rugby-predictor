import { supabase } from '@/lib/supabase'

function getSessionId() {
  if (typeof window === 'undefined') return null

  const key = 'nextplay_session_id'
  let sessionId = localStorage.getItem(key)

  if (!sessionId) {
    sessionId = crypto.randomUUID()
    localStorage.setItem(key, sessionId)
  }

  return sessionId
}

export async function trackEvent(
  eventType: string,
  page?: string,
  details: Record<string, unknown> = {}
) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`
    }

    await fetch('/api/usage-events', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event_type: eventType,
        page: page || null,
        details,
        session_id: getSessionId(),
      }),
    })
  } catch (err) {
    console.error('Tracking error:', err)
  }
}
