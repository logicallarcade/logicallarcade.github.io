'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { escapeHTML, getOrCreateUsername } from '@/lib/utils'
import type { LobbyPresence, ActiveRoom } from '@/types'

const GAME_LABELS: Record<string, string> = {
  wordle: 'Wordle', sudoku: 'Sudoku', bingo: 'Bingo', typerace: 'Type Race',
}
const GAME_ICONS: Record<string, string> = {
  wordle: 'fa-solid fa-font',
  sudoku: '',            // uses text
  bingo: 'fa-solid fa-circle-dot',
  typerace: 'fa-solid fa-keyboard',
}

export default function LobbyPanel() {
  const [onlineCount, setOnlineCount] = useState(0)
  const [rooms, setRooms] = useState<ActiveRoom[]>([])
  const [countdown, setCountdown] = useState(10)
  const [refreshing, setRefreshing] = useState(false)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clientId = useRef(Math.random().toString(36).substring(2, 10))

  const renderRooms = useCallback((state: Record<string, LobbyPresence[]>) => {
    const all: LobbyPresence[] = []
    Object.values(state).forEach(arr => arr.forEach(p => all.push(p)))
    setOnlineCount(all.length)

    const seen = new Set<string>()
    const activeRooms: ActiveRoom[] = []
    all.forEach(p => {
      if (p.roomCode && p.game && !seen.has(p.roomCode)) {
        seen.add(p.roomCode)
        activeRooms.push({
          roomCode: p.roomCode,
          game: p.game,
          hostName: p.hostName || 'Host',
          playerCount: p.playerCount || 1,
          maxPlayers: p.maxPlayers || 4,
        })
      }
    })
    setRooms(activeRooms)
  }, [])

  const setupLobby = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const username = getOrCreateUsername()
    const ch = supabase.channel('arcade-lobby', {
      config: { presence: { key: clientId.current } },
    })

    const onPresenceChange = () => renderRooms(ch.presenceState() as Record<string, LobbyPresence[]>)

    ch
      .on('presence', { event: 'sync' }, onPresenceChange)
      .on('presence', { event: 'join' }, onPresenceChange)
      .on('presence', { event: 'leave' }, onPresenceChange)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({
            status: 'lobby',
            username,
            clientId: clientId.current,
            onlineAt: new Date().toISOString(),
          })
        }
      })

    channelRef.current = ch
  }, [renderRooms])

  const startCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(10)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Auto-refresh
          setRefreshing(true)
          if (channelRef.current) supabase.removeChannel(channelRef.current)
          setTimeout(() => {
            setupLobby()
            setRefreshing(false)
          }, 600)
          return 10
        }
        return prev - 1
      })
    }, 1000)
  }, [setupLobby])

  const handleRefresh = () => {
    setRefreshing(true)
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    setCountdown(10)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setTimeout(() => {
      setupLobby()
      startCountdown()
      setRefreshing(false)
    }, 800)
  }

  useEffect(() => {
    setupLobby()
    startCountdown()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [setupLobby, startCountdown])

  return (
    <aside
      className="w-full lg:w-[220px] lg:flex-shrink-0 flex flex-col border order-1 lg:order-2"
      style={{
        background: 'var(--color-bg-panel)',
        borderColor: 'var(--color-border)',
        minHeight: 180,
        maxHeight: 240,
        borderRadius: 4,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-1.5">
          <i className="fa-solid fa-tower-broadcast text-[10px]" style={{ color: 'var(--color-gold-dim)' }} />
          <span className="text-xs font-bold" style={{ color: 'var(--color-ivory)', fontFamily: 'var(--font-serif)' }}>
            Lobby Aktif
          </span>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.18)', color: '#4ade80' }}
          >
            <span className="w-1 h-1 rounded-full bg-green-400" style={{ animation: 'pulse-green 2s infinite' }} />
            {onlineCount}
          </span>
          <span className="text-[8px] ml-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            ⟳ {countdown}s
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh daftar room"
          className="w-6 h-6 flex items-center justify-center rounded transition-all"
          style={{ border: '1px solid var(--color-border)', background: 'transparent' }}
        >
          <i
            className={`fa-solid fa-rotate text-[9px] transition-all ${refreshing ? 'animate-spin' : ''}`}
            style={{ color: 'var(--color-text-muted)' }}
          />
        </button>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
        {rooms.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-6 text-center px-2">
            <i className="fa-solid fa-chess-board text-2xl mb-2" style={{ color: 'var(--color-border-glow)' }} />
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Belum ada room dibagikan.<br />Buat room &amp; klik &quot;Bagikan ke Lobby&quot;!
            </p>
          </div>
        ) : (
          rooms.map(room => {
            const gameKey = room.game.toLowerCase()
            const isFull = room.playerCount >= room.maxPlayers
            const joinUrl = `./${gameKey}/?room=${encodeURIComponent(room.roomCode)}`

            return (
              <div key={room.roomCode} className="lobby-room-card">
                <div className="flex items-center justify-between mb-1">
                  <span className={`lobby-badge lobby-badge--${gameKey}`}>
                    {GAME_ICONS[gameKey]
                      ? <i className={GAME_ICONS[gameKey]} />
                      : <span className="font-mono font-black text-[9px]">123</span>
                    }
                    {GAME_LABELS[gameKey] ?? gameKey}
                  </span>
                  <span className={`lobby-players lobby-players--${isFull ? 'full' : 'open'}`}>
                    <span className={`lobby-dot lobby-dot--${isFull ? 'full' : 'open'}`} />
                    {room.playerCount}/{room.maxPlayers}
                  </span>
                </div>
                <p className="lobby-hostname">{escapeHTML(room.hostName)}</p>
                <p className="lobby-code">{escapeHTML(room.roomCode)}</p>
                <button
                  disabled={isFull}
                  onClick={() => !isFull && (window.location.href = joinUrl)}
                  className={`lobby-join-btn lobby-join-btn--${isFull ? 'full' : 'open'}`}
                >
                  {isFull
                    ? <><i className="fa-solid fa-lock" /> Penuh</>
                    : <><i className="fa-solid fa-right-to-bracket" /> Gabung</>
                  }
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div
        className="px-3 py-1.5 text-[9px] text-center flex items-center justify-center gap-1"
        style={{
          borderTop: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <i className="fa-solid fa-rotate text-[8px]" />
        Auto-refresh setiap 10 detik
      </div>
    </aside>
  )
}
