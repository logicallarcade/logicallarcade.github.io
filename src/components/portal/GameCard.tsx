'use client'

import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'

interface GameCardActiveProps {
  game: 'wordle' | 'sudoku' | 'bingo' | 'typerace'
  title: string
  description: string
  badge: string
  iconClass?: string
  iconText?: string
  thumbnailSrc: string
  href: string
  accentColor: string
  featured?: boolean
}

interface GameCardComingSoonProps {
  title: string
  description: string
  iconClass: string
  accentColor: string
}

type GameCardProps =
  | ({ active: true } & GameCardActiveProps)
  | ({ active: false } & GameCardComingSoonProps)

export default function GameCard(props: GameCardProps) {
  const router = useRouter()

  if (!props.active) {
    const { title, description, iconClass, accentColor } = props
    return (
      <div
        className="arcade-card aspect-square flex flex-col justify-between p-4"
        onClick={() => Swal.fire({
          background: '#1a1208', color: '#d4c89a', confirmButtonColor: '#c9a227',
          title: 'Segera Hadir!',
          html: `Game <strong style="color:#c9a227">${title}</strong> sedang dikembangkan.<br><br><span style="color:#7a6a4a;font-size:0.8rem">Tunggu pembaruan berikutnya!</span>`,
          confirmButtonText: 'Siap, Ditunggu!',
          width: 360,
        })}
        style={{ cursor: 'pointer' }}
      >
        <div
          className="w-9 h-9 rounded flex items-center justify-center"
          style={{
            background: `${accentColor}15`,
            border: `1px solid ${accentColor}25`,
          }}
        >
          <i className={`${iconClass} text-base`} style={{ color: accentColor }} />
        </div>
        <div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--color-ivory)', fontFamily: 'var(--font-serif)' }}>
            {title}
          </h3>
          <p className="text-[10px] mt-0.5" style={{ color: accentColor, fontFamily: 'var(--font-mono)', opacity: 0.8 }}>
            {description}
          </p>
          <span
            className="text-[8px] font-bold uppercase tracking-wider mt-1 block"
            style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
          >
            Segera Hadir
          </span>
        </div>
      </div>
    )
  }

  const { title, description, badge, iconClass, iconText, thumbnailSrc, href, accentColor, featured, game } = props

  return (
    <div
      className={`arcade-card arcade-card--${game} flex flex-col justify-between group relative overflow-hidden ${featured ? 'col-span-2 row-span-2 p-5' : 'aspect-square p-4'}`}
      onClick={() => router.push(href)}
      style={{ cursor: 'pointer' }}
    >
      {/* Ribbon */}
      <div
        className="absolute top-2 left-[-28px] text-[7px] font-black uppercase tracking-widest py-0.5 px-8 -rotate-45 z-20 select-none"
        style={{
          background: `${accentColor}cc`,
          color: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        Logicall
      </div>

      {/* Thumbnail */}
      <img
        src={thumbnailSrc}
        alt={title}
        className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-35 transition-opacity duration-400 pointer-events-none z-0"
      />

      {/* Gold corner ornament */}
      <div
        className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none z-0 opacity-15"
        style={{
          background: `radial-gradient(circle at bottom right, ${accentColor} 0%, transparent 70%)`,
        }}
      />

      {/* Icon */}
      {featured ? (
        <div className="flex items-start justify-between relative z-10 w-full">
          <span
            className="text-[9px] font-extrabold px-2 py-0.5 rounded-sm uppercase tracking-widest ml-8 mt-1"
            style={{
              background: `${accentColor}25`,
              color: accentColor,
              border: `1px solid ${accentColor}40`,
              fontFamily: 'var(--font-mono)',
              animation: 'pulse-green 2.5s ease-in-out infinite',
            }}
          >
            {badge}
          </span>
          <div
            className="w-12 h-12 rounded flex items-center justify-center"
            style={{
              background: `${accentColor}18`,
              border: `1px solid ${accentColor}35`,
              boxShadow: `0 0 16px ${accentColor}25`,
            }}
          >
            {iconText
              ? <span className="text-white text-xl font-black font-mono tracking-tighter select-none">{iconText}</span>
              : <i className={`${iconClass} text-xl`} style={{ color: accentColor }} />
            }
          </div>
        </div>
      ) : (
        <div className="flex justify-end relative z-10">
          <div
            className="w-9 h-9 rounded flex items-center justify-center transition-all"
            style={{
              background: `${accentColor}12`,
              border: `1px solid ${accentColor}25`,
            }}
          >
            {iconText
              ? <span className="text-sm font-black font-mono" style={{ color: accentColor }}>{iconText}</span>
              : <i className={`${iconClass} text-base`} style={{ color: accentColor }} />
            }
          </div>
        </div>
      )}

      {/* Labels */}
      <div className="z-10 relative" style={{ marginTop: featured ? 16 : 0 }}>
        <span
          className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-sm uppercase tracking-widest block w-max mb-1"
          style={{
            background: `${accentColor}18`,
            color: accentColor,
            border: `1px solid ${accentColor}30`,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {badge}
        </span>
        <h3
          className={`font-bold transition-colors ${featured ? 'text-xl md:text-2xl' : 'text-base'}`}
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-ivory)',
            letterSpacing: '0.02em',
          }}
        >
          {title}
        </h3>
        <p
          className="text-xs mt-0.5"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
        >
          {description}
        </p>
      </div>
    </div>
  )
}

