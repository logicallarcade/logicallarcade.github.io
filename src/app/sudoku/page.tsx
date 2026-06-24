import type { Metadata } from 'next'
import { Suspense } from 'react'
import SudokuGame from '@/components/sudoku/SudokuGame'

export const metadata: Metadata = {
  title: 'Sudoku — Logicall Arcade',
  description: 'Mainkan game asah otak Sudoku klasik. Solo atau Multiplayer co-op.',
}

export default function SudokuPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-gold)' }}>Memuat...</div>}>
      <SudokuGame />
    </Suspense>
  )
}
