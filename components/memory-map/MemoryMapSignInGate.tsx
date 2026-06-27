'use client'

import Link from 'next/link'
import {
  buildMemoryMapSignInHref,
  buildMemoryMapSignUpHref,
} from '@/lib/memory-map/auth-routes'

type Props = {
  title: string
  description: string
  returnPath: string
  backHref?: string
  backLabel?: string
}

export default function MemoryMapSignInGate({
  title,
  description,
  returnPath,
  backHref = '/memory-map',
  backLabel = 'Back to Memory Map',
}: Props) {
  return (
    <section className="mx-auto max-w-lg space-y-4 px-5 py-10">
      <h1 className="text-2xl font-black">{title}</h1>
      <p className="mm-muted text-sm leading-relaxed">{description}</p>
      <Link
        href={buildMemoryMapSignInHref(returnPath)}
        className="mm-btn-primary block rounded-2xl px-4 py-3 text-center text-sm font-black"
      >
        Sign in
      </Link>
      <Link
        href={buildMemoryMapSignUpHref(returnPath)}
        className="mm-btn-secondary block rounded-2xl px-4 py-3 text-center text-sm font-bold"
      >
        Create account
      </Link>
      <Link href={backHref} className="mm-muted block text-center text-sm font-bold underline underline-offset-4">
        {backLabel}
      </Link>
    </section>
  )
}
