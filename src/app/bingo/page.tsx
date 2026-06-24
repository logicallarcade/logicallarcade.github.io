import type { Metadata } from 'next'
import { Suspense } from 'react'
import BingoGame from '@/components/bingo/BingoGame'

export const metadata: Metadata = {
  title: 'Bingo — Logicall Arcade',
  description: 'Mainkan Bingo Royale. Solo atau Multiplayer.',
}

export default function BingoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-gold)' }}>Memuat...</div>}>
      <BingoGame />
    </Suspense>
  )
}
