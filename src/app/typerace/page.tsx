import type { Metadata } from 'next'
import { Suspense } from 'react'
import TypeRaceGame from '@/components/typerace/TypeRaceGame'

export const metadata: Metadata = {
  title: 'Type Race — Logicall Arcade',
  description: 'Balapan mengetik kalimat Bahasa Indonesia. Solo vs Bot atau Multiplayer real-time. Lihat WPM dan CPM kamu!',
}

export default function TypeRacePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-gold)' }}>Memuat...</div>}>
      <TypeRaceGame />
    </Suspense>
  )
}
