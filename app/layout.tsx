import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: 'School Rugby Predictor',
  description: 'Predicting school rugby match outcomes using linked margins',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>

        {/* Top Navigation */}
        <header className="border-b bg-white">
          <nav className="flex items-center justify-between px-6 py-4">

            {/* LEFT SIDE - ADMIN */}
            <div>
              <Link
                href="/admin"
                className="font-semibold text-red-600 hover:underline"
              >
                Admin
              </Link>
            </div>

            {/* RIGHT SIDE - PUBLIC NAV */}
            <div className="flex items-center gap-6">

              <Link
                href="/"
                className="font-medium hover:underline"
              >
                Predictor
              </Link>

              <Link
                href="/results"
                className="font-medium hover:underline"
              >
                Results
              </Link>

              <Link
                href="/rankings"
                className="font-medium hover:underline"
              >
                Rankings
              </Link>

              <Link
                href="/network"
                className="font-medium hover:underline"
              >
                Visual Graph
              </Link>

            </div>

          </nav>
        </header>

        {/* Page Content */}
        <main className="px-6 py-6">
          {children}
        </main>

      </body>
    </html>
  )
}