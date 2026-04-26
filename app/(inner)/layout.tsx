import InnerHeaderNav from '@/components/InnerHeaderNav'

export default function InnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <header className="border-b border-gray-200">
        <InnerHeaderNav />
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
