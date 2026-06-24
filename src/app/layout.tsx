import type { Metadata } from 'next'
import { Playfair_Display, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  display: 'swap',
})

const ibmMono = IBM_Plex_Mono({
  variable: '--font-ibm-mono',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Logicall — Portal Game Logika & Asah Otak',
  description:
    'Portal game minimalis dengan Sudoku Pro, Wordle Bahasa Indonesia, Bingo Royale, dan Type Race. Mainkan solo atau multiplayer real-time bersama teman!',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${playfair.variable} ${ibmMono.variable}`}>
      <head>
        {/* FontAwesome */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
          crossOrigin="anonymous"
        />
        {/* SweetAlert2 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css"
          crossOrigin="anonymous"
        />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎮</text></svg>" />
      </head>
      <body className="min-h-screen flex flex-col">
        {/* CRT scanline overlay — subtle classic aesthetic */}
        <div className="crt-overlay" aria-hidden="true" />
        {children}
      </body>
    </html>
  )
}
