'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import PortalHeader from '@/components/portal/Header'
import GameCard from '@/components/portal/GameCard'
import LobbyPanel from '@/components/portal/LobbyPanel'
import { getOrCreateUsername } from '@/lib/utils'

/* ── GAME GRID CONFIG ──────────────────────────────────────────────────────── */
const ACTIVE_GAMES = [
  {
    game: 'wordle' as const, title: 'Wordle', badge: 'Game Populer',
    description: 'Tebak Kata (Bahasa Indonesia)',
    iconClass: 'fa-solid fa-font', thumbnailSrc: '/assets/wordle_thumbnail.png',
    href: '/wordle', accentColor: '#2e7d32',
  },
  {
    game: 'sudoku' as const, title: 'Sudoku', badge: 'Main Sekarang',
    description: 'Multiplayer co-op hingga 5 pemain. Notes, Hint.',
    iconText: '123', thumbnailSrc: '/assets/sudoku_thumbnail.png',
    href: '/sudoku', accentColor: '#6d28d9', featured: true,
  },
  {
    game: 'bingo' as const, title: 'Bingo', badge: 'Game Populer',
    description: 'Solo & Multiplayer (2-8 Pemain)',
    iconClass: 'fa-solid fa-circle-dot', thumbnailSrc: '/assets/bingo_thumbnail.png',
    href: '/bingo', accentColor: '#0e7490',
  },
  {
    game: 'typerace' as const, title: 'Type Race', badge: 'Game Populer',
    description: 'Solo & Multiplayer (Balap Ketik)',
    iconClass: 'fa-solid fa-keyboard', thumbnailSrc: '/assets/typerace_thumbnail.png',
    href: '/typerace', accentColor: '#c9a227',
  },
]

const COMING_SOON = [
  { title: 'Chess', description: 'Ahli Strategi', iconClass: 'fa-solid fa-chess-knight', accentColor: '#f59e0b' },
  { title: 'Minesweeper', description: 'Awas Meledak', iconClass: 'fa-solid fa-bomb', accentColor: '#ef4444' },
  { title: 'Block Puzzle', description: 'Tata Balok', iconClass: 'fa-solid fa-cubes', accentColor: '#6366f1' },
  { title: 'Ghost Hunter', description: 'Kejar Monster', iconClass: 'fa-solid fa-ghost', accentColor: '#eab308' },
  { title: '2048 Grid', description: 'Gabung Angka', iconClass: 'fa-solid fa-calculator', accentColor: '#f97316' },
  { title: 'Alien Attack', description: 'Tembak Invasi', iconClass: 'fa-solid fa-rocket', accentColor: '#a855f7' },
  { title: 'Sling Ball', description: 'Pinball Klasik', iconClass: 'fa-solid fa-circle-notch', accentColor: '#ec4899' },
  { title: 'Brain Match', description: 'Cari Pasangan', iconClass: 'fa-solid fa-clone', accentColor: '#db2777' },
  { title: 'Brick Breaker', description: 'Hancurkan Dinding', iconClass: 'fa-solid fa-table-cells', accentColor: '#14b8a6' },
]

export default function PortalPage() {
  const [username, setUsername] = useState('Pemain')
  const [swalReady, setSwalReady] = useState(false)

  useEffect(() => {
    setUsername(getOrCreateUsername())
  }, [])

  return (
    <>
      {/* SweetAlert2 Script */}
      <Script
        src="https://cdn.jsdelivr.net/npm/sweetalert2@11"
        strategy="afterInteractive"
        onLoad={() => setSwalReady(true)}
      />

      <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
        <PortalHeader
          username={username}
          onUsernameChange={setUsername}
        />

        <main className="relative flex-grow max-w-6xl w-full mx-auto px-4 py-6 md:py-10 fade-in">
          {/* Section Title */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, var(--color-gold-dim), transparent)' }} />
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: 'var(--color-gold-dim)', fontFamily: 'var(--font-mono)' }}
              >
                ✦ Pilih Permainan ✦
              </span>
              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, var(--color-gold-dim))' }} />
            </div>
            <p className="text-center text-[10px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              Solo mode atau Multiplayer real-time bersama teman
            </p>
          </div>

          {/* Two-column layout */}
          <div className="flex flex-col lg:flex-row gap-4 items-start w-full">
            {/* Game Grid */}
            <div className="w-full lg:flex-1 min-w-0 order-2 lg:order-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 w-full grid-flow-row-dense">
                {/* Active games */}
                {ACTIVE_GAMES.map(g => (
                  <GameCard key={g.game} active={true} {...g} />
                ))}
                {/* Coming soon */}
                {COMING_SOON.map(cs => (
                  <GameCard key={cs.title} active={false} {...cs} />
                ))}
              </div>
            </div>

            {/* Lobby Sidebar */}
            <LobbyPanel />
          </div>
        </main>

        <footer
          className="relative z-10 py-5 text-center text-xs border-t"
          style={{
            color: 'var(--color-text-muted)',
            borderColor: 'var(--color-border)',
            fontFamily: 'var(--font-mono)',
            background: 'var(--color-bg-panel)',
          }}
        >
          <p>
            <span style={{ color: 'var(--color-gold-dim)' }}>✦</span>
            {' '}&copy; 2026 Logicall Games.{' '}
            <span style={{ color: 'var(--color-gold-dim)' }}>✦</span>
          </p>
        </footer>
      </div>
    </>
  )
}
