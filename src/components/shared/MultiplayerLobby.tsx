'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import Swal from 'sweetalert2'
import { supabase } from '@/lib/supabase'
import { escapeHTML } from '@/lib/utils'

interface MultiplayerLobbyProps {
  gameKey: string
  isMultiplayer: boolean
  isHost: boolean
  roomCode: string
  maxPlayers: number
  players: PlayerInfo[]
  isSharedToLobby: boolean
  onCreateRoom: (capacity: number) => void
  onJoinRoom: (code: string) => void
  onLeaveRoom: () => void
  onShareLobby: () => void
  onStartGame?: () => void
  onKickPlayer?: (clientId: string, username: string) => void
  myClientId: string
  startBtnLabel?: string
  startBtnDisabled?: boolean
  canStart?: boolean
  showRoomInfo: boolean
  shareLink: string
  onCopyRoomCode: () => void
  onCopyRoomLink: () => void
  soloSettingsSlot?: React.ReactNode
}

export interface PlayerInfo {
  clientId: string
  username: string
  isHost: boolean
  isMe: boolean
  onlineAt?: string
}

export default function MultiplayerLobby({
  gameKey, isMultiplayer, isHost, roomCode, maxPlayers, players,
  isSharedToLobby, onCreateRoom, onJoinRoom, onLeaveRoom, onShareLobby,
  onStartGame, onKickPlayer, myClientId, startBtnLabel = 'Mulai Game',
  startBtnDisabled, canStart, showRoomInfo, shareLink,
  onCopyRoomCode, onCopyRoomLink, soloSettingsSlot,
}: MultiplayerLobbyProps) {
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [maxSelect, setMaxSelect] = useState(String(maxPlayers))
  const [startClicked, setStartClicked] = useState(false)

  useEffect(() => {
    setStartClicked(false)
  }, [players.length, showRoomInfo])

  const handleCreateRoom = () => {
    onCreateRoom(gameKey === 'Wordle' ? 2 : Number(maxSelect))
  }

  return (
    <section className="relative z-10 max-w-4xl w-full mx-auto px-4 mt-4">
      <div
        className="rounded p-4 flex flex-col gap-3"
        style={{
          background: 'var(--color-bg-panel)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span
            className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"
            style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
          >
            <i className="fa-solid fa-users" style={{ color: 'var(--color-gold-dim)' }} />
            Lobi {gameKey} Versus
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {/* Solo settings slot */}
          {!isMultiplayer && soloSettingsSlot}

          {/* Create & Join controls */}
          {!showRoomInfo && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Create room */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Kapasitas Room
                </label>
                <div className="flex gap-2">
                  {gameKey === 'Wordle' ? (
                    <div
                      className="flex-1 rounded px-2.5 py-1.5 text-xs font-bold flex items-center justify-center border"
                      style={{
                        background: '#0a0804',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      2 Pemain (1v1)
                    </div>
                  ) : (
                    <select
                      value={maxSelect}
                      onChange={e => setMaxSelect(e.target.value)}
                      className="flex-1 rounded px-2.5 py-1.5 text-xs font-bold focus:outline-none"
                      style={{
                        background: '#0a0804',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-ivory)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {[2,3,4,6,8].map(n => <option key={n} value={n}>{n} Pemain</option>)}
                    </select>
                  )}
                  <button onClick={handleCreateRoom} className="brass-btn px-3 py-1.5 text-[10px]">
                    <i className="fa-solid fa-users" /> Buat Room
                  </button>
                </div>
              </div>

              {/* Join room */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Gabung Room Lain
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Kode Room"
                    value={roomCodeInput}
                    onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
                    className="classic-input flex-1"
                    onKeyDown={e => e.key === 'Enter' && onJoinRoom(roomCodeInput)}
                  />
                  <button onClick={() => onJoinRoom(roomCodeInput)} className="brass-btn px-3 py-1.5 text-[10px]">
                    Gabung
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Room info (when room is open) */}
          {showRoomInfo && (
            <div
              className="flex flex-col gap-2 p-2.5 rounded"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                Kode Room Anda:
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={roomCode}
                  className="flex-grow text-[10px] rounded px-2 py-1 font-bold focus:outline-none select-all text-center"
                  style={{ background: '#05040200', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
                />
                <button onClick={onCopyRoomCode} className="brass-btn px-2.5 py-1 text-[9px]">Salin Kode</button>
                <button onClick={onCopyRoomCode} className="brass-btn px-2.5 py-1 text-[9px]">Salin Link</button>
              </div>
              <div className="flex gap-2 mt-1">
                {/* Share to lobby */}
                {isHost && !isSharedToLobby && (
                  <button onClick={onShareLobby} className="flex-1 py-2 rounded text-[10px] font-bold transition flex items-center justify-center gap-1" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)', fontFamily: 'var(--font-mono)' }}>
                    <i className="fa-solid fa-share-nodes" /> Bagikan ke Lobby Portal
                  </button>
                )}
                {isHost && isSharedToLobby && (
                  <button disabled className="flex-1 py-2 rounded text-[10px] font-bold flex items-center justify-center gap-1 opacity-60" style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', fontFamily: 'var(--font-mono)' }}>
                    <i className="fa-solid fa-circle-check" /> Telah Dibagikan
                  </button>
                )}
                {/* Start button (host only) */}
                {isHost && canStart && onStartGame && (
                  <button
                    onClick={() => {
                      setStartClicked(true)
                      onStartGame()
                    }}
                    disabled={startBtnDisabled || startClicked}
                    className="flex-1 py-2 rounded text-[10px] font-bold transition flex items-center justify-center gap-1"
                    style={{
                      background: (startBtnDisabled || startClicked) ? 'rgba(80,80,80,0.2)' : 'var(--color-gold)',
                      color: (startBtnDisabled || startClicked) ? '#666' : '#1a1208',
                      border: '1px solid var(--color-gold-dim)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {startBtnLabel}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Player list */}
          {showRoomInfo && players.length > 0 && (
            <div
              className="flex flex-col gap-1.5 p-2.5 rounded"
              style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)' }}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                Daftar Pemain ({players.length}/{maxPlayers})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {players.map(p => (
                  <div
                    key={p.clientId}
                    className="flex items-center justify-between p-2 rounded"
                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }}
                  >
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.isMe ? '#4ade80' : '#60a5fa', animation: 'pulse-green 2s infinite' }} />
                      <strong style={{ color: 'var(--color-ivory)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                        {escapeHTML(p.username)}
                      </strong>
                      {p.isMe && <span className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>(Anda)</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase"
                        style={{
                          background: 'rgba(201,162,39,0.12)',
                          color: 'var(--color-gold-dim)',
                          border: '1px solid rgba(201,162,39,0.2)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {p.isHost ? 'Host' : 'Tamu'}
                      </span>
                      {isHost && !p.isMe && onKickPlayer && (
                        <button
                          onClick={() => onKickPlayer(p.clientId, p.username)}
                          className="text-[8px] px-1 py-0.5 rounded"
                          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', fontFamily: 'var(--font-mono)' }}
                        >
                          Kick
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  Swal.fire({
                    title: isHost ? 'Tutup Room?' : 'Keluar Room?',
                    html: `
                      <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--color-text); text-align: center;">
                        ${isHost ? 'Apakah Anda yakin ingin menutup room ini?<br/>Semua pemain di lobi akan dikeluarkan.' : 'Apakah Anda yakin ingin keluar dari room ini?'}
                      </div>
                    `,
                    icon: 'warning',
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text)',
                    showCancelButton: true,
                    confirmButtonText: 'Ya, Keluar',
                    cancelButtonText: 'Batal',
                    confirmButtonColor: 'var(--color-burgundy)',
                    cancelButtonColor: 'var(--color-gold-dim)',
                    customClass: {
                      popup: 'ornate-border classic-card',
                      title: 'text-sm font-bold tracking-widest',
                    }
                  }).then((res) => {
                    if (res.isConfirmed) {
                      onLeaveRoom()
                    }
                  })
                }}
                className="w-full py-1.5 rounded text-[10px] font-bold transition flex items-center justify-center gap-1.5"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)', fontFamily: 'var(--font-mono)' }}
              >
                <i className="fa-solid fa-arrow-right-from-bracket" />
                {isHost ? 'Tutup Room' : 'Keluar Room'}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
