'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'

interface GamePageShellProps {
  /** HTML content to render inside the shell (the full game HTML body content) */
  htmlContent: string
  /** Path to the game's CSS file (from /game-styles/) */
  cssHref: string
  /** Path to the game's JS file (from /game-scripts/) */
  scriptSrc: string
  /** Game title for metadata */
  title: string
}

/**
 * Generic shell for embedding existing vanilla-JS game logic inside Next.js.
 * The HTML content is injected via dangerouslySetInnerHTML so all existing IDs
 * remain intact for the game scripts to target with document.getElementById().
 *
 * The game script is loaded after the DOM is rendered, replicating the
 * behavior of a plain HTML page with a <script> tag at the bottom of <body>.
 */
export default function GamePageShell({ htmlContent, cssHref, scriptSrc, title }: GamePageShellProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scriptLoaded = useRef(false)

  useEffect(() => {
    // Inject game CSS dynamically
    const existingLink = document.getElementById('game-css')
    if (existingLink) existingLink.remove()
    const link = document.createElement('link')
    link.id = 'game-css'
    link.rel = 'stylesheet'
    link.href = cssHref
    document.head.appendChild(link)

    return () => {
      const l = document.getElementById('game-css')
      if (l) l.remove()
    }
  }, [cssHref])

  return (
    <>
      {/* SweetAlert2 */}
      <Script src="https://cdn.jsdelivr.net/npm/sweetalert2@11" strategy="beforeInteractive" />
      {/* Supabase */}
      <Script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" strategy="beforeInteractive" />
      {/* Game script — loads after DOM is ready */}
      <Script src={scriptSrc} strategy="afterInteractive" />

      {/* The game HTML rendered verbatim */}
      <div
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </>
  )
}
