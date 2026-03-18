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
  details: Record<string, any> = {}
) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    await supabase.from('usage_events').insert([
      {
        event_type: eventType,
        page: page || null,
        details,
        user_email: session?.user?.email || null,
        session_id: getSessionId(),
      },
    ])
  } catch (err) {
    console.error('Tracking error:', err)
  }
}