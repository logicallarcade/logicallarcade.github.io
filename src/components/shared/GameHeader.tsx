'use client'

interface GameHeaderProps {
  title: string
  subtitle: string
  connectionStatus: string
  connectionDot: 'solo' | 'host' | 'guest' | 'connecting'
  playerRoleBadge?: string | null
  onBack: () => void
  onRestart: () => void
  onStats: () => void
  onHelp: () => void
  username: string
  onUsernameChange: (val: string) => void
}

const DOT_COLORS: Record<string, string> = {
  solo: '#f59e0b',
  host: '#f59e0b',
  guest: '#4ade80',
  connecting: '#f59e0b',
}

export default function GameHeader({
  title, subtitle, connectionStatus, connectionDot, playerRoleBadge,
  onBack, onRestart, onStats, onHelp,
  username, onUsernameChange,
}: GameHeaderProps) {
  return (
    <header
      className="relative z-10 px-3 sm:px-6 py-3 sm:py-4"
      style={{
        background: 'linear-gradient(180deg, #1e1508 0%, #17120a 100%)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Top gold accent line */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{
        background: 'linear-gradient(90deg, transparent, var(--color-gold-dim), var(--color-gold), var(--color-gold-dim), transparent)',
      }} />

      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Left: Back + title */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={onBack} className="brass-btn px-3 py-1.5 text-[10px]">
            <i className="fa-solid fa-arrow-left" /> Kembali
          </button>
          <div>
            <h2
              className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ivory)' }}
            >
              {title}
              {playerRoleBadge && (
                <span
                  className="text-[9px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide"
                  style={{
                    background: 'rgba(201,162,39,0.15)',
                    color: 'var(--color-gold)',
                    border: '1px solid rgba(201,162,39,0.25)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {playerRoleBadge}
                </span>
              )}
            </h2>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              {subtitle}
            </p>
          </div>
        </div>

        {/* Right: status + controls + username */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs">
          {/* Username */}
          <div
            className="flex items-center gap-1 px-2 py-1.5 rounded"
            style={{ background: 'rgba(10,8,4,0.6)', border: '1px solid var(--color-border)' }}
          >
            <i className="fa-solid fa-user text-[9px]" style={{ color: 'var(--color-gold-dim)' }} />
            <input
              type="text"
              placeholder="Nama"
              maxLength={12}
              value={username}
              onChange={e => onUsernameChange(e.target.value)}
              className="bg-transparent border-none text-[10px] sm:text-xs font-bold focus:outline-none w-14 sm:w-20"
              style={{ color: 'var(--color-ivory)', fontFamily: 'var(--font-mono)' }}
            />
          </div>

          {/* Connection status */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded h-[34px]"
            style={{ background: 'rgba(10,8,4,0.6)', border: '1px solid var(--color-border)' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: DOT_COLORS[connectionDot] ?? '#f59e0b',
                animation: 'pulse-green 2s infinite',
              }}
            />
            <span
              className="text-[10px] font-bold hidden sm:block"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
            >
              {connectionStatus}
            </span>
          </div>

          {/* Restart */}
          <button
            onClick={onRestart}
            title="Ulangi Permainan"
            className="w-9 h-9 rounded flex items-center justify-center transition-all"
            style={{ border: '1px solid var(--color-border)', background: 'rgba(10,8,4,0.4)' }}
          >
            <i className="fa-solid fa-arrow-rotate-right text-sm" style={{ color: 'var(--color-gold-dim)' }} />
          </button>

          {/* Stats */}
          <button
            onClick={onStats}
            title="Statistik"
            className="w-9 h-9 rounded flex items-center justify-center transition-all"
            style={{ border: '1px solid var(--color-border)', background: 'rgba(10,8,4,0.4)' }}
          >
            <i className="fa-solid fa-chart-simple text-sm" style={{ color: 'var(--color-text-muted)' }} />
          </button>

          {/* Help */}
          <button
            onClick={onHelp}
            title="Cara Bermain"
            className="w-9 h-9 rounded flex items-center justify-center transition-all"
            style={{ border: '1px solid var(--color-border)', background: 'rgba(10,8,4,0.4)' }}
          >
            <i className="fa-solid fa-circle-info text-sm" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>
      </div>
    </header>
  )
}
