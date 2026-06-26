import { NextResponse } from 'next/server'
import { requireAuthenticatedApi } from '@/lib/predictions-api-auth'
import { savePoolLogo, uploadPoolLogoFile } from '@/lib/pool-logo-upload'

type RouteContext = { params: Promise<{ poolId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuthenticatedApi(request)
  if (auth instanceof NextResponse) return auth

  const { poolId } = await context.params
  const trimmedPoolId = poolId?.trim() ?? ''
  if (!trimmedPoolId) {
    return NextResponse.json({ error: 'Pool is required.' }, { status: 400 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Logo file is required.' }, { status: 400 })
  }

  const uploaded = await uploadPoolLogoFile(auth.supabase, trimmedPoolId, file)
  if ('error' in uploaded) {
    const status = uploaded.error.toLowerCase().includes('row-level security') ? 403 : 400
    return NextResponse.json({ error: uploaded.error }, { status })
  }

  const { pool, error } = await savePoolLogo(
    auth.supabase,
    trimmedPoolId,
    uploaded.logoUrl,
    uploaded.logoPath
  )

  if (error) {
    const status = error.toLowerCase().includes('admin') || error.toLowerCase().includes('forbidden')
      ? 403
      : 500
    return NextResponse.json({ error }, { status })
  }

  return NextResponse.json({ ok: true, pool })
}
