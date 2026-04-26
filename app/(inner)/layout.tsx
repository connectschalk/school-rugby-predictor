import Image from 'next/image'
import Link from 'next/link'
import InnerHeaderNav from '@/components/InnerHeaderNav'

export default function InnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <header className="border-b border-gray-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex shrink-0 items-center gap-4">
            <Image
              src="/nextplay-predictor.png"
              alt="NextPlay Predictor"
              width={240}
              height={80}
              priority
            />
          </Link>

          <InnerHeaderNav />
        </div>
      </header>

      {children}

      <footer className="mt-20 border-t border-gray-200">
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-gray-600">
          Contact:
          <a
            href="mailto:info@thenextplay.co.za"
            className="ml-1 text-black hover:underline"
          >
            info@thenextplay.co.za
          </a>
        </div>
      </footer>
    </>
  )
}