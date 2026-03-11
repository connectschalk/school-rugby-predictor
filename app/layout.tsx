import './globals.css'
import Image from 'next/image'

export const metadata = {
  title: 'NextPlay Predictor',
  description: 'School Rugby Predictor',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-white text-black">

        {/* HEADER */}

        <header className="border-b border-gray-200">
          <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">

            <div className="flex items-center gap-4">
              <Image
                src="/nextplay-predictor.png"
                alt="NextPlay Predictor"
                width={240}
                height={80}
                priority
              />
            </div>

            <nav className="flex gap-6 text-sm font-medium">
              <a href="/" className="hover:underline">Predictor</a>
              <a href="/results" className="hover:underline">Results</a>
              <a href="/rankings" className="hover:underline">Rankings</a>
              <a href="/network" className="hover:underline">Visual Graph</a>
            </nav>

          </div>
        </header>


        {/* PAGE CONTENT */}

        {children}


        {/* FOOTER */}

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

      </body>
    </html>
  )
}