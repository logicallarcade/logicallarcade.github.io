import type { Metadata } from 'next'
import { Suspense } from 'react'
import WordleGame from '@/components/wordle/WordleGame'

export const metadata: Metadata = {
  title: 'Wordle — Logicall Arcade',
  description: 'Tebak kata 5 huruf dalam Bahasa Indonesia. Solo atau Multiplayer Versus.',
}

export default function WordlePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-gold)' }}>Memuat...</div>}>
      <WordleGame />
    </Suspense>
  )
}
