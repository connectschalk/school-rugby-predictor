'use client'

import Link from 'next/link'

/** Public launch nav (Tools hidden; /tools still works when opened directly). */
export default function InnerHeaderNav() {
  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium sm:justify-end">
      <Link href="/" className="hover:underline">
        Home
      </Link>
      <Link href="/predict-score" className="hover:underline">
        Predict a Score
      </Link>
      <Link href="/user-rankings" className="hover:underline">
        User Rankings
      </Link>
      <Link href="/predict-score?how=1" className="hover:underline">
        How it works
      </Link>
      <Link href="/profile" className="hover:underline">
        Profile
      </Link>
    </nav>
  )
}
