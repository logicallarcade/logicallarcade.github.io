'use client'

import { useEffect, useRef } from 'react'
import Swal from 'sweetalert2'
import { supabase } from '@/lib/supabase'
import { saveUsername } from '@/lib/utils'

interface HeaderProps {
  username: string
  onUsernameChange: (val: string) => void
  channelRef?: React.MutableRefObject<ReturnType<typeof supabase.channel> | null>
  clientId?: string
}

export default function PortalHeader({ username, onUsernameChange, channelRef, clientId }: HeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = username
  }, [username])

  const handleChange = (val: string) => {
    onUsernameChange(val)
    saveUsername(val)
    // If in a lobby channel, re-track with new name
    if (channelRef?.current && clientId && val.trim()) {
      channelRef.current.track({
        status: 'lobby',
        username: val.trim(),
        clientId,
        onlineAt: new Date().toISOString(),
      })
    }
  }

  const toggleAbout = () => {
    Swal.fire({
      background: '#1a1208',
      color: '#d4c89a',
      confirmButtonColor: '#c9a227',
      title: '<i class="fa-solid fa-circle-info" style="color:#c9a227;margin-right:6px"></i>Tentang Logicall',
      html: `<div style="text-align:left;font-size:0.82rem;color:#9c8a60;line-height:1.8;font-family:var(--font-serif)">
        <p><strong style="color:#f0e8d8">Logicall</strong> adalah portal game asah otak bergaya arcade klasik, terinspirasi dari konsep Friv Grid klasik.</p>
        <p style="margin-top:10px">Mainkan <strong style="color:#c9a227">Sudoku Pro</strong>, <strong style="color:#4ade80">Wordle Indonesia</strong>, <strong style="color:#22d3ee">Bingo Royale</strong>, dan <strong style="color:#e8c85a">Type Race</strong> secara solo atau multiplayer bersama teman secara realtime.</p>
      </div>`,
      confirmButtonText: 'Mengerti',
      width: 400,
    })
  }

  return (
    <header
      className="relative z-10 px-3 sm:px-6 py-3 sm:py-4"
      style={{
        background: 'linear-gradient(180deg, #1e1508 0%, #17120a 100%)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Top gold accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, var(--color-gold-dim), var(--color-gold), var(--color-gold-dim), transparent)',
        }}
      />

      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <div
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group"
          onClick={() => window.location.reload()}
        >
          <div
            className="w-8 h-8 sm:w-10 sm:h-10 rounded flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #2a1e08, #1a1208)',
              border: '1px solid var(--color-gold-dim)',
              boxShadow: '0 0 12px rgba(201,162,39,0.15), inset 0 1px 0 rgba(201,162,39,0.1)',
            }}
          >
            <i className="fa-solid fa-gamepad text-base sm:text-lg" style={{ color: 'var(--color-gold)' }} />
          </div>
          <div>
            <h1
              className="text-lg sm:text-2xl font-extrabold tracking-widest"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-gold-light)' }}
            >
              Logicall
            </h1>
            <p
              className="text-[8px] sm:text-[10px] tracking-widest font-bold uppercase -mt-1"
              style={{ color: 'var(--color-gold-dim)', fontFamily: 'var(--font-mono)' }}
            >
              ARCADE PORTAL
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Username input */}
          <div
            className="flex items-center gap-1.5 px-2 py-1.5 rounded"
            style={{ background: 'rgba(10,8,4,0.6)', border: '1px solid var(--color-border)' }}
          >
            <i className="fa-solid fa-user text-[10px] sm:text-xs" style={{ color: 'var(--color-gold-dim)' }} />
            <input
              ref={inputRef}
              type="text"
              id="global-username-input"
              placeholder="Nama"
              maxLength={12}
              defaultValue={username}
              onChange={e => handleChange(e.target.value)}
              className="bg-transparent border-none text-[10px] sm:text-xs font-bold focus:outline-none w-14 sm:w-24"
              style={{ color: 'var(--color-ivory)', fontFamily: 'var(--font-mono)' }}
            />
          </div>

          {/* Refresh */}
          <button
            onClick={() => window.location.reload()}
            title="Refresh Halaman"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded flex items-center justify-center transition-all group"
            style={{ border: '1px solid var(--color-border)', background: 'rgba(10,8,4,0.4)' }}
          >
            <i className="fa-solid fa-arrows-rotate text-sm group-hover:rotate-180 transition-transform duration-500" style={{ color: 'var(--color-gold-dim)' }} />
          </button>

          {/* About */}
          <button
            onClick={toggleAbout}
            title="Tentang Logicall"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded flex items-center justify-center transition-all"
            style={{ border: '1px solid var(--color-border)', background: 'rgba(10,8,4,0.4)' }}
          >
            <i className="fa-solid fa-circle-info text-sm" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>
      </div>
    </header>
  )
}
