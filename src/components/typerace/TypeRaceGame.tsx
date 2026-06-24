'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Swal from 'sweetalert2'
import { supabase } from '@/lib/supabase'
import { generateRoomCode, getOrCreateUsername, saveUsername, escapeHTML } from '@/lib/utils'
import GameHeader from '@/components/shared/GameHeader'

// ── INDONESIAN QUOTE POOL ─────────────────────────────────────────────────────
const QUOTES_POOL = [
  "Belajar tanpa berpikir itu tidak berguna, berpikir tanpa belajar itu sangat berbahaya.",
  "Hari esok adalah halaman kosong, tulislah kisah terbaikmu di sana dengan penuh semangat.",
  "Kemajuan teknologi harus diimbangi dengan peningkatan kebijaksanaan dalam pemanfaatannya.",
  "Kegagalan hanyalah kesempatan untuk memulai lagi dengan cara yang lebih cerdas dan matang.",
  "Semua impian kita bisa menjadi nyata jika kita memiliki keberanian untuk mengejarnya tanpa lelah.",
  "Masa depan adalah milik mereka yang percaya pada keindahan mimpi-mimpi mereka sendiri.",
  "Pendidikan adalah tiket hari esok, karena hari esok dimiliki oleh orang-orang yang mempersiapkan diri hari ini.",
  "Kita tidak bisa memecahkan masalah dengan menggunakan jenis pemikiran yang sama seperti saat kita menciptakannya.",
  "Kehidupan yang baik adalah kehidupan yang diinspirasikan oleh cinta dan dipandu oleh pengetahuan.",
  "Keberhasilan tidak diukur dari apa yang Anda capai, melainkan dari rintangan yang Anda hadapi untuk mencapainya.",
  "Jangan pernah menunda pekerjaanmu sampai besok jika kamu bisa menyelesaikannya hari ini.",
  "Untuk mencapai hal-hal besar, kita tidak hanya harus bertindak, tetapi juga bermimpi dan percaya.",
  "Bagian terbaik dari hidup seseorang adalah perbuatan-perbuatan baiknya yang kecil dan tanpa nama.",
  "Disiplin adalah jembatan antara cita-cita dan pencapaian nyata di dunia.",
  "Meskipun tidak ada orang yang bisa kembali ke masa lalu untuk membuat awal yang baru, siapa pun bisa mulai sekarang untuk membuat akhir yang baru.",
  "Hanya orang yang berani menghadapi kegagalan besar yang dapat mencapai keberhasilan besar.",
  "Keberhasilan bukanlah akhir, kegagalan bukanlah hal yang fatal: itu adalah keberanian untuk melanjutkan yang penting.",
  "Setiap tindakan kecil dari kebaikan akan menciptakan gelombang yang kembali kepada kita dalam bentuk yang tak terduga.",
  "Bekerja keras dalam diam dan biarkan kesuksesan Anda yang menjadi suara bising di sekitar Anda.",
  "Kunci untuk menjadi bahagia adalah menerima keadaan hari ini sambil terus berusaha membangun masa depan yang cerah.",
]

// ── TYPES ─────────────────────────────────────────────────────────────────────
interface Opponent {
  clientId: string
  username: string
  isBot: boolean
  wpm: number
  progress: number
  currentWpm: number
  status: 'waiting' | 'playing' | 'finished'
  finishedTime: number | null
  isHost?: boolean
}

interface LeaderboardEntry {
  clientId: string
  username: string
  wpm: number
  cpm: number
  time: number
  isBot: boolean
  unfinished?: boolean
  progress?: number
}

type GamePhase = 'idle' | 'countdown' | 'playing' | 'finished'
type CountdownVal = 5 | 4 | 3 | 2 | 1 | 0

// ── CHARACTER-LEVEL PASSAGE RENDERER ──────────────────────────────────────────
interface PassageProps {
  words: string[]
  currentWordIndex: number
  inputVal: string
  phase: GamePhase
}

function PassageDisplay({ words, currentWordIndex, inputVal, phase }: PassageProps) {
  if (phase === 'idle') {
    return (
      <span style={{ color: 'var(--color-text-muted)' }}>
        Paragraf akan muncul di sini setelah hitung mundur dimulai. Ketik secepat mungkin dengan keyboard bawaan device Anda!
      </span>
    )
  }

  return (
    <>
      {words.map((word, wIdx) => {
        const isCurrentWord = wIdx === currentWordIndex
        const isPastWord = wIdx < currentWordIndex

        const chars = word.split('').map((char, cIdx) => {
          let color = 'var(--color-text-muted)'
          let bg = 'transparent'
          let borderBottom = 'none'

          if (isPastWord) {
            color = '#4ade80'
          } else if (isCurrentWord) {
            if (cIdx < inputVal.length) {
              color = inputVal[cIdx] === char ? '#4ade80' : '#f87171'
              if (inputVal[cIdx] !== char) bg = 'rgba(239,68,68,0.12)'
            } else if (cIdx === inputVal.length) {
              color = 'var(--color-gold)'
              borderBottom = '2px solid var(--color-gold)'
            }
          }

          return (
            <span
              key={cIdx}
              style={{ color, background: bg, borderBottom, transition: 'color 0.1s' }}
            >
              {char}
            </span>
          )
        })

        let spaceEl: React.ReactNode = null
        if (wIdx < words.length - 1) {
          let spaceColor = 'var(--color-text-muted)'
          if (isPastWord) spaceColor = '#4ade80'
          spaceEl = <span key={`sp-${wIdx}`} style={{ color: spaceColor }}>{' '}</span>
        }

        return (
          <span
            key={wIdx}
            style={{
              borderBottom: isCurrentWord ? '1px dashed rgba(201,162,39,0.3)' : 'none',
              paddingBottom: isCurrentWord ? 2 : 0,
            }}
          >
            {chars}
            {spaceEl}
          </span>
        )
      })}
    </>
  )
}

// ── RACE TRACK ────────────────────────────────────────────────────────────────
interface RaceTrackProps {
  username: string
  isMe?: boolean
  progress: number
  wpm: number
  accentColor?: string
}

function RaceTrack({ username, isMe, progress, wpm, accentColor = '#c9a227' }: RaceTrackProps) {
  const clampedLeft = Math.min(Math.max(0, progress - 4), 96)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />
          <span style={{ color: 'var(--color-ivory)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {escapeHTML(username)}
            {isMe && <span style={{ color: 'var(--color-gold-dim)', fontSize: '0.65rem' }}> (Anda)</span>}
          </span>
        </div>
        <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          {wpm} WPM — {progress}%
        </span>
      </div>
      <div
        className="relative h-6 rounded-sm overflow-hidden"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)' }}
      >
        {/* Road markings */}
        <div className="absolute inset-0 flex items-center">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              style={{ flex: 1, height: 1, borderRight: i < 9 ? '1px dashed rgba(255,255,255,0.06)' : 'none' }}
            />
          ))}
        </div>
        {/* Finish line */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1"
          style={{
            background: 'repeating-linear-gradient(180deg, #fff 0px, #fff 3px, #000 3px, #000 6px)',
            opacity: 0.6,
          }}
        />
        {/* Car */}
        <div
          className="absolute top-0 bottom-0 flex items-center transition-all duration-500"
          style={{ left: `${clampedLeft}%` }}
        >
          <i className="fa-solid fa-car-side text-sm" style={{ color: accentColor }} />
        </div>
      </div>
    </div>
  )
}

// ── COUNTDOWN OVERLAY ─────────────────────────────────────────────────────────
function CountdownOverlay({ count }: { count: CountdownVal }) {
  const dot1Class = count > 3 ? 'bg-red-500 shadow-lg shadow-red-500/40' : 'bg-gray-700'
  const dot2Class = count > 1 && count <= 3 ? 'bg-amber-500 shadow-lg shadow-amber-500/40' : 'bg-gray-700'
  const dot3Class = count === 0 ? 'bg-green-500 shadow-lg shadow-green-500/40 animate-ping' : 'bg-gray-700'

  return (
    <div className="absolute inset-0 flex items-center justify-center z-20 rounded" style={{ background: 'rgba(10,8,4,0.92)' }}>
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          <span className={`w-4 h-4 rounded-full ${dot1Class}`} />
          <span className={`w-4 h-4 rounded-full ${dot2Class}`} />
          <span className={`w-4 h-4 rounded-full ${dot3Class}`} />
        </div>
        <span
          className="text-sm font-extrabold uppercase tracking-wider"
          style={{ color: 'var(--color-ivory)', fontFamily: 'var(--font-mono)' }}
        >
          {count > 0 ? `Bersiap... ${count}` : 'GO!'}
        </span>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function TypeRaceGame() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── User state
  const [username, setUsername] = useState('')
  const myClientId = useRef(Math.random().toString(36).substring(2, 10))

  // ── Game state
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [currentQuote, setCurrentQuote] = useState('')
  const [quoteWords, setQuoteWords] = useState<string[]>([])
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [inputVal, setInputVal] = useState('')
  const [hasTypo, setHasTypo] = useState(false)
  const [gameDuration, setGameDuration] = useState(60)
  const [remainingSeconds, setRemainingSeconds] = useState(60)
  const [countdownVal, setCountdownVal] = useState<CountdownVal>(5)
  const [countdownActive, setCountdownActive] = useState(false)
  const [countdownCount, setCountdownCount] = useState(5)
  const [isStartingGame, setIsStartingGame] = useState(false)
  const [wpm, setWpm] = useState(0)
  const [cpm, setCpm] = useState(0)
  const [progressPct, setProgressPct] = useState(0)

  // Refs for timer/game values (avoid stale closures)
  const typedCorrectCharsRef = useRef(0)
  const totalCharsRef = useRef(0)
  const gameStartTimeRef = useRef<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Multiplayer state
  const [isMultiplayer, setIsMultiplayer] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [isSharedToLobby, setIsSharedToLobby] = useState(false)
  const [showRoomInfo, setShowRoomInfo] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [players, setPlayers] = useState<{ clientId: string; username: string; isHost: boolean; isMe: boolean }[]>([])
  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lobbyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── Race state
  const [botCount, setBotCount] = useState(2)
  const [opponents, setOpponents] = useState<Opponent[]>([])
  const opponentsRef = useRef<Opponent[]>([])
  const [versusStarted, setVersusStarted] = useState(false)
  const opponentProgressRef = useRef<Record<string, { progress: number; wpm: number; status: 'waiting' | 'playing' | 'finished'; finishedTime: number | null }>>({})
  const hasClickedStartRef = useRef(false)

  // ── Results state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [myFinished, setMyFinished] = useState<{ wpm: number; cpm: number; time: number; accuracy: number; progress: number; finishedTime: number | null } | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // ── Toast state
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])
  const toastId = useRef(0)

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const uname = getOrCreateUsername()
    setUsername(uname)

    // Auto-join from URL param
    const roomParam = searchParams.get('room')
    if (roomParam) {
      setTimeout(() => joinVersusRoom(roomParam.trim().toUpperCase()), 300)
    } else {
      setupSoloBots(2)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (roomChannelRef.current) supabase.removeChannel(roomChannelRef.current)
      if (lobbyChannelRef.current) supabase.removeChannel(lobbyChannelRef.current)
    }
  }, []) // eslint-disable-line

  // ── Focus typing input when game starts
  useEffect(() => {
    if (phase === 'playing') {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [phase])

  // ── Auto-track lobby presence
  useEffect(() => {
    if (isMultiplayer && isHost && isSharedToLobby && lobbyChannelRef.current) {
      lobbyChannelRef.current.track({
        roomCode,
        game: 'typerace',
        hostName: username,
        playerCount: players.length,
        maxPlayers,
        updatedAt: new Date().toISOString()
      })
    }
  }, [players.length, maxPlayers, username, isMultiplayer, isHost, isSharedToLobby, roomCode])

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2200)
  }, [])

  // ── Solo bot setup ────────────────────────────────────────────────────────
  const setupSoloBots = useCallback((count: number) => {
    const BOTS: Opponent[] = [
      { clientId: 'bot-0', username: 'Racer Andi [Bot]', isBot: true, wpm: 35, progress: 0, currentWpm: 0, status: 'waiting', finishedTime: null },
      { clientId: 'bot-1', username: 'Racer Budi [Bot]', isBot: true, wpm: 45, progress: 0, currentWpm: 0, status: 'waiting', finishedTime: null },
      { clientId: 'bot-2', username: 'Racer Citra [Bot]', isBot: true, wpm: 58, progress: 0, currentWpm: 0, status: 'waiting', finishedTime: null },
    ]
    const bots = BOTS.slice(0, count)
    opponentsRef.current = bots
    setOpponents([...bots])
  }, [])

  // ── Select quote ──────────────────────────────────────────────────────────
  const selectQuote = useCallback(() => {
    const q = QUOTES_POOL[Math.floor(Math.random() * QUOTES_POOL.length)]
    const words = q.split(' ')
    const totalChars = q.length
    const dur = Math.max(30, Math.ceil((words.length / 20) * 60) + 10)

    totalCharsRef.current = totalChars
    setCurrentQuote(q)
    setQuoteWords(words)
    setGameDuration(dur)
    setRemainingSeconds(dur)
    return { quote: q, words, totalChars, duration: dur }
  }, [])

  // ── Calc metrics ──────────────────────────────────────────────────────────
  const calcMetrics = useCallback((inputValue: string, wordIndex: number, words: string[]) => {
    if (!gameStartTimeRef.current) return { wpm: 0, cpm: 0, progress: 0 }
    const elapsed = (Date.now() - gameStartTimeRef.current.getTime()) / 1000
    if (elapsed < 1) return { wpm: 0, cpm: 0, progress: 0 }

    let correctInWord = 0
    const targetWord = words[wordIndex]
    if (targetWord) {
      for (let i = 0; i < inputValue.length; i++) {
        if (inputValue[i] === targetWord[i]) correctInWord++
        else break
      }
    }

    const chars = typedCorrectCharsRef.current + correctInWord
    const mins = elapsed / 60
    const wpmVal = Math.round((chars / 5) / mins)
    const cpmVal = Math.round(chars / mins)
    const pct = totalCharsRef.current > 0 ? Math.min(100, Math.round((chars / totalCharsRef.current) * 100)) : 0
    return { wpm: wpmVal, cpm: cpmVal, progress: pct }
  }, [])

  // ── Start countdown then game ─────────────────────────────────────────────
  const startCountdown = useCallback((afterQuoteSet: () => void) => {
    setPhase('countdown')
    setCountdownVal(5)
    setCountdownCount(5)
    setCountdownActive(true)
    setVersusStarted(true)
    let c = 5

    const cdInt = setInterval(() => {
      c--
      setCountdownVal(c as CountdownVal)
      setCountdownCount(c)
      if (c < 0) {
        clearInterval(cdInt)
        setCountdownActive(false)
        setPhase('playing')
        gameStartTimeRef.current = new Date()
        typedCorrectCharsRef.current = 0
        afterQuoteSet()
      }
    }, 1000)
  }, [])

  // ── Launch timer ──────────────────────────────────────────────────────────
  const launchTimer = useCallback((duration: number, words: string[]) => {
    let rem = duration
    timerRef.current = setInterval(() => {
      rem--
      setRemainingSeconds(rem)

      // Update metrics
      const inputValue = inputRef.current?.value ?? ''
      const wIdx = /* stale closure workaround */ currentWordIndex
      const m = calcMetrics(inputValue, wIdx, words)
      setWpm(m.wpm)
      setCpm(m.cpm)
      setProgressPct(m.progress)

      // Tick bots
      if (!isMultiplayer && gameStartTimeRef.current) {
        const elapsed = (Date.now() - gameStartTimeRef.current.getTime()) / 1000
        const mins = elapsed / 60
        const updated = opponentsRef.current.map(bot => {
          if (bot.finishedTime !== null) return bot
          const botCpm = bot.wpm * 5
          const typedChars = botCpm * mins
          const rand = 1 + Math.sin(elapsed + bot.wpm) * 0.1
          const prog = Math.min(100, Math.round((typedChars * rand / totalCharsRef.current) * 100))
          const nowWpm = Math.round(bot.wpm * rand)
          if (prog >= 100) {
            return { ...bot, progress: 100, currentWpm: nowWpm, finishedTime: elapsed, status: 'finished' as const }
          }
          return { ...bot, progress: prog, currentWpm: nowWpm }
        })
        opponentsRef.current = updated
        setOpponents([...updated])
      }

      if (rem <= 0) {
        clearInterval(timerRef.current!)
        handleTimeExpired(words, duration)
      }
    }, 1000)
  }, [calcMetrics, isMultiplayer]) // eslint-disable-line

  // ── Solo game start ───────────────────────────────────────────────────────
  const startSoloGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('idle')
    setCurrentWordIndex(0)
    setInputVal('')
    setHasTypo(false)
    setWpm(0); setCpm(0); setProgressPct(0)
    setMyFinished(null)
    setLeaderboard([])

    // Reset bots
    const resetBots = opponentsRef.current.map(b => ({ ...b, progress: 0, currentWpm: 0, status: 'waiting' as const, finishedTime: null }))
    opponentsRef.current = resetBots
    setOpponents([...resetBots])

    const { words, duration } = selectQuote()

    startCountdown(() => {
      launchTimer(duration, words)
    })
  }, [selectQuote, startCountdown, launchTimer])

  // ── Typing handler ────────────────────────────────────────────────────────
  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (phase !== 'playing') return
    const val = e.target.value
    const targetWord = quoteWords[currentWordIndex]
    if (!targetWord) return

    if (val.endsWith(' ')) {
      const trimmed = val.trim()
      if (trimmed === targetWord) {
        typedCorrectCharsRef.current += targetWord.length + 1
        const nextIdx = currentWordIndex + 1
        setCurrentWordIndex(nextIdx)
        setInputVal('')
        setHasTypo(false)

        const m = calcMetrics('', nextIdx, quoteWords)
        setWpm(m.wpm); setCpm(m.cpm); setProgressPct(m.progress)

        if (isMultiplayer) broadcastProgress(m.progress, m.wpm, m.cpm)
      } else {
        setInputVal(trimmed)
        setHasTypo(true)
      }
      return
    }

    // Last word completion (no space needed)
    if (currentWordIndex === quoteWords.length - 1 && val === targetWord) {
      typedCorrectCharsRef.current += targetWord.length
      handleGameFinished(quoteWords)
      return
    }

    // Typo check
    const section = val.slice(0, Math.min(val.length, targetWord.length))
    const typo = !targetWord.startsWith(section) || val.length > targetWord.length
    setHasTypo(typo)
    setInputVal(val)

    const m = calcMetrics(val, currentWordIndex, quoteWords)
    setWpm(m.wpm); setCpm(m.cpm); setProgressPct(m.progress)
    if (isMultiplayer) broadcastProgress(m.progress, m.wpm, m.cpm)
  }, [phase, quoteWords, currentWordIndex, calcMetrics, isMultiplayer]) // eslint-disable-line

  // ── Finish handlers ───────────────────────────────────────────────────────
  const handleGameFinished = useCallback((words: string[]) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('finished')
    const elapsed = gameStartTimeRef.current
      ? Math.round((Date.now() - gameStartTimeRef.current.getTime()) / 1000)
      : gameDuration

    const finalWpm = Math.round((typedCorrectCharsRef.current / 5) / (elapsed / 60))
    const finalCpm = Math.round(typedCorrectCharsRef.current / (elapsed / 60))

    const myResult = { wpm: finalWpm, cpm: finalCpm, time: elapsed, accuracy: 100, progress: 100, finishedTime: elapsed }
    setMyFinished(myResult)

    // Save to localStorage
    const played = parseInt(localStorage.getItem('logicall_typerace_played') || '0') + 1
    const maxWpm = Math.max(parseInt(localStorage.getItem('logicall_typerace_max_wpm') || '0'), finalWpm)
    const maxCpm = Math.max(parseInt(localStorage.getItem('logicall_typerace_max_cpm') || '0'), finalCpm)
    localStorage.setItem('logicall_typerace_played', String(played))
    localStorage.setItem('logicall_typerace_max_wpm', String(maxWpm))
    localStorage.setItem('logicall_typerace_max_cpm', String(maxCpm))

    if (isMultiplayer && roomChannelRef.current) {
      roomChannelRef.current.send({ type: 'broadcast', event: 'typerace-finished', payload: myResult })
    }

    // Build leaderboard
    const lb: LeaderboardEntry[] = [{ clientId: myClientId.current, username, wpm: finalWpm, cpm: finalCpm, time: elapsed, isBot: false }]
    if (!isMultiplayer) {
      opponentsRef.current.forEach(bot => {
        const t = bot.finishedTime ?? Math.round(totalCharsRef.current / (bot.wpm * 5) * 60)
        lb.push({ clientId: bot.clientId, username: bot.username, wpm: bot.wpm, cpm: bot.wpm * 5, time: Math.round(t), isBot: true })
      })
      lb.sort((a, b) => a.time - b.time)
      setLeaderboard(lb)
    }

    setTimeout(() => setShowStats(true), 800)
  }, [gameDuration, isMultiplayer, username])

  const handleTimeExpired = useCallback((words: string[], duration: number) => {
    setPhase('finished')
    const finalWpm = wpm
    const finalCpm = cpm

    const myResult = { wpm: finalWpm, cpm: finalCpm, time: duration, accuracy: 100, progress: progressPct, finishedTime: null }
    setMyFinished(myResult)

    if (isMultiplayer && roomChannelRef.current) {
      roomChannelRef.current.send({ type: 'broadcast', event: 'typerace-finished', payload: myResult })
    }

    const lb: LeaderboardEntry[] = [{ clientId: myClientId.current, username, wpm: finalWpm, cpm: finalCpm, time: duration, isBot: false, unfinished: true, progress: progressPct }]
    if (!isMultiplayer) {
      opponentsRef.current.forEach(bot => {
        const finished = bot.finishedTime !== null
        lb.push({
          clientId: bot.clientId, username: bot.username, wpm: bot.wpm, cpm: bot.wpm * 5,
          time: finished ? Math.round(bot.finishedTime!) : duration,
          isBot: true, unfinished: !finished, progress: finished ? 100 : bot.progress,
        })
      })
      lb.sort((a, b) => {
        if (a.unfinished && b.unfinished) return (b.progress ?? 0) - (a.progress ?? 0)
        if (a.unfinished) return 1
        if (b.unfinished) return -1
        return a.time - b.time
      })
      setLeaderboard(lb)
    }

    setTimeout(() => setShowStats(true), 800)
  }, [wpm, cpm, progressPct, isMultiplayer, username])

  // ── Multiplayer ───────────────────────────────────────────────────────────
  const broadcastProgress = (progress: number, wpmVal: number, cpmVal: number) => {
    if (!roomChannelRef.current) return
    roomChannelRef.current.send({
      type: 'broadcast', event: 'typerace-progress',
      payload: { clientId: myClientId.current, progress, wpm: wpmVal, cpm: cpmVal },
    })
  }

  const createVersusRoom = useCallback(() => {
    const code = generateRoomCode(5)
    setRoomCode(code)
    setIsMultiplayer(true)
    setIsHost(true)
    setShowRoomInfo(true)
    setShareLink(`${window.location.origin}/typerace?room=${code}`)
    setupMultiplayerChannel(code, true)
    setVersusStarted(false)
    hasClickedStartRef.current = false
    setPhase('idle')
    setInputVal('')
    setCurrentWordIndex(0)
    setHasTypo(false)
    setProgressPct(0)
    setWpm(0)
    setCpm(0)
    setOpponents([])
    setLeaderboard([])
    setMyFinished(null)
    showToast('Room dibuat!')
  }, [showToast]) // eslint-disable-line

  const joinVersusRoom = useCallback((code: string) => {
    const sanitized = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    if (!sanitized || sanitized.length < 5) { showToast('Kode room tidak valid!'); return }
    setRoomCode(sanitized)
    setIsMultiplayer(true)
    setIsHost(false)
    setShowRoomInfo(true)
    setShareLink(`${window.location.origin}/typerace?room=${sanitized}`)
    setVersusStarted(false)
    hasClickedStartRef.current = false
    setPhase('idle')
    setInputVal('')
    setCurrentWordIndex(0)
    setHasTypo(false)
    setProgressPct(0)
    setWpm(0)
    setCpm(0)
    setOpponents([])
    setLeaderboard([])
    setMyFinished(null)
    setupMultiplayerChannel(sanitized, false)
  }, [showToast]) // eslint-disable-line

  const setupMultiplayerChannel = (code: string, asHost: boolean) => {
    if (roomChannelRef.current) supabase.removeChannel(roomChannelRef.current)
    const uname = getOrCreateUsername()
    const ch = supabase.channel(`typerace-room-${code}`, {
      config: { presence: { key: myClientId.current } },
    })

    ch
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState() as Record<string, any[]>
        const list: { clientId: string; username: string; isHost: boolean; isMe: boolean }[] = []
        Object.values(state).forEach(arr => arr.forEach((p: any) => {
          list.push({ clientId: p.clientId, username: p.username, isHost: !!p.isHost, isMe: p.clientId === myClientId.current })
        }))
        setPlayers(list)

        const hostExists = list.some(p => p.isHost)
        if (list.length > 0 && !hostExists && !asHost) {
          Swal.fire({
            title: 'Room Ditutup',
            html: 'Host telah meninggalkan room ini.',
            icon: 'info',
            background: 'var(--color-bg-card)',
            color: 'var(--color-text)',
            confirmButtonText: 'OK',
            confirmButtonColor: 'var(--color-gold)',
            customClass: { popup: 'ornate-border classic-card' }
          }).then(() => {
            leaveVersusRoom()
          })
          return
        }

        setOpponents(prev => {
          const otherPlayers = list.filter(p => p.clientId !== myClientId.current)
          const updated = otherPlayers.map(p => {
            const saved = opponentProgressRef.current[p.clientId]
            return {
              clientId: p.clientId,
              username: p.username,
              isBot: false,
              wpm: saved ? saved.wpm : 0,
              progress: saved ? saved.progress : 0,
              currentWpm: saved ? saved.wpm : 0,
              status: saved ? saved.status : 'waiting',
              finishedTime: saved ? saved.finishedTime : null,
              isHost: p.isHost
            }
          })
          opponentsRef.current = updated
          return updated
        })
      })
      .on('broadcast', { event: 'typerace-start' }, ({ payload }) => {
        const { quote, duration } = payload
        setShowStats(false)
        totalCharsRef.current = quote.length
        setCurrentQuote(quote)
        setQuoteWords(quote.split(' '))
        setGameDuration(duration)
        setCurrentWordIndex(0)
        typedCorrectCharsRef.current = 0
        setInputVal('')
        setMyFinished(null)
        setProgressPct(0)
        setWpm(0)
        setCpm(0)
        setLeaderboard([])
        opponentProgressRef.current = {}
        setOpponents(prev =>
          prev.map(opp => ({
            ...opp,
            progress: 0,
            wpm: 0,
            currentWpm: 0,
            status: 'waiting',
            finishedTime: null
          }))
        )
        opponentsRef.current = opponentsRef.current.map(opp => ({
          ...opp,
          progress: 0,
          wpm: 0,
          currentWpm: 0,
          status: 'waiting',
          finishedTime: null
        }))
        startCountdown(() => launchTimer(duration, quote.split(' ')))
      })
      .on('broadcast', { event: 'typerace-progress' }, ({ payload }) => {
        const { clientId, progress, wpm: oppWpm } = payload
        opponentProgressRef.current[clientId] = {
          progress,
          wpm: oppWpm,
          status: 'playing',
          finishedTime: null
        }
        setOpponents(prev => {
          const updated = prev.map(o => o.clientId === clientId ? { ...o, progress, currentWpm: oppWpm } : o)
          opponentsRef.current = updated
          return updated
        })
      })
      .on('broadcast', { event: 'typerace-finished' }, ({ payload }) => {
        const { username: oppName, wpm: oppWpm, cpm: oppCpm, time, progress } = payload
        opponentProgressRef.current[payload.clientId] = {
          progress: progress ?? 100,
          wpm: oppWpm,
          status: 'finished',
          finishedTime: time
        }
        setOpponents(prev => {
          const updated = prev.map(o => o.clientId === payload.clientId
            ? { ...o, progress: progress ?? 100, finishedTime: time, status: 'finished' as const, wpm: oppWpm, currentWpm: oppWpm }
            : o)
          opponentsRef.current = updated
          return updated
        })
        setLeaderboard(prev => {
          if (prev.some(l => l.clientId === payload.clientId)) return prev
          const updated = [...prev, { clientId: payload.clientId, username: oppName, wpm: oppWpm, cpm: oppCpm, time, isBot: false, unfinished: !payload.finishedTime, progress }]
          return updated.sort((a, b) => a.time - b.time)
        })
      })
      .on('broadcast', { event: 'typerace-kick' }, ({ payload }) => {
        if (payload.targetClientId === myClientId.current) {
          Swal.fire({
            title: 'Dikeluarkan',
            html: 'Anda telah dikeluarkan dari room oleh Host.',
            icon: 'warning',
            background: 'var(--color-bg-card)',
            color: 'var(--color-text)',
            confirmButtonText: 'OK',
            confirmButtonColor: 'var(--color-gold)',
            customClass: { popup: 'ornate-border classic-card' }
          }).then(() => {
            leaveVersusRoom()
            router.push('/')
          })
        }
      })
      .on('broadcast', { event: 'typerace-close' }, () => {
        setShowStats(false)
        Swal.fire({
          title: 'Room Ditutup',
          html: 'Host telah menutup room ini.',
          icon: 'info',
          background: 'var(--color-bg-card)',
          color: 'var(--color-text)',
          confirmButtonText: 'OK',
          confirmButtonColor: 'var(--color-gold)',
          customClass: { popup: 'ornate-border classic-card' }
        }).then(() => {
          leaveVersusRoom()
          router.push('/')
        })
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ clientId: myClientId.current, username: uname, isHost: asHost })
          if (!asHost) showToast('Berhasil bergabung room!')
        }
      })

    roomChannelRef.current = ch
  }

  const shareRoomToLobby = useCallback(() => {
    if (lobbyChannelRef.current) supabase.removeChannel(lobbyChannelRef.current)
    const ch = supabase.channel('arcade-lobby', { config: { presence: { key: myClientId.current } } })
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setIsSharedToLobby(true)
        await ch.track({ roomCode, game: 'typerace', hostName: username, playerCount: players.length || 1, maxPlayers, updatedAt: new Date().toISOString() })
        showToast('Room dibagikan ke Lobby!')
      }
    })
    lobbyChannelRef.current = ch
  }, [roomCode, username, players.length, maxPlayers, showToast])

  const leaveVersusRoom = useCallback(() => {
    if (isHost && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'typerace-close',
        payload: {}
      })
    }
    if (roomChannelRef.current) { supabase.removeChannel(roomChannelRef.current); roomChannelRef.current = null }
    if (lobbyChannelRef.current) { supabase.removeChannel(lobbyChannelRef.current); lobbyChannelRef.current = null }
    if (timerRef.current) clearInterval(timerRef.current)
    setIsMultiplayer(false); setIsHost(false); setRoomCode(''); setIsSharedToLobby(false)
    setShowRoomInfo(false); setPlayers([]); setPhase('idle')
    setCurrentWordIndex(0); setInputVal(''); setWpm(0); setCpm(0); setProgressPct(0)
    setVersusStarted(false)
    hasClickedStartRef.current = false
    setShowStats(false)
    setupSoloBots(botCount)
    showToast('Keluar dari room')
  }, [botCount, setupSoloBots, showToast, isHost])

  const startVersusGame = useCallback(() => {
    if (!isHost || players.length < 2) { showToast('Butuh minimal 2 pemain!'); return }
    if (hasClickedStartRef.current) return
    hasClickedStartRef.current = true
    setIsStartingGame(true)
    const { quote, words, totalChars, duration } = selectQuote()
    totalCharsRef.current = totalChars
    if (roomChannelRef.current) {
      roomChannelRef.current.send({ type: 'broadcast', event: 'typerace-start', payload: { quote, duration } })
    }
    setMyFinished(null)
    setProgressPct(0)
    setWpm(0)
    setCpm(0)
    setLeaderboard([])
    opponentProgressRef.current = {}
    setOpponents(prev =>
      prev.map(opp => ({
        ...opp,
        progress: 0,
        wpm: 0,
        currentWpm: 0,
        status: 'waiting',
        finishedTime: null
      }))
    )
    opponentsRef.current = opponentsRef.current.map(opp => ({
      ...opp,
      progress: 0,
      wpm: 0,
      currentWpm: 0,
      status: 'waiting',
      finishedTime: null
    }))
    setCurrentWordIndex(0)
    typedCorrectCharsRef.current = 0
    setInputVal('')
    startCountdown(() => {
      launchTimer(duration, words)
      setIsStartingGame(false)
      hasClickedStartRef.current = false
    })
  }, [isHost, players.length, selectQuote, startCountdown, launchTimer, showToast])

  const kickPlayer = useCallback((clientId: string) => {
    if (!roomChannelRef.current) return
    roomChannelRef.current.send({ type: 'broadcast', event: 'typerace-kick', payload: { targetClientId: clientId } })
  }, [])

  const copyRoomCode = () => { navigator.clipboard.writeText(roomCode); showToast('Kode room disalin!') }
  const copyRoomLink = () => { navigator.clipboard.writeText(roomCode); showToast('Kode room disalin!') }

  const handleUsernameChange = (val: string) => {
    setUsername(val)
    saveUsername(val)
    if (roomChannelRef.current && val.trim()) {
      roomChannelRef.current.track({ clientId: myClientId.current, username: val.trim(), isHost })
    }
  }

  // ── Rendered metrics ──────────────────────────────────────────────────────
  const accentColors = ['#c9a227', '#22d3ee', '#f87171', '#a78bfa']

  const myProgress = myFinished ? 100 : progressPct

  // ── Stats data from localStorage ──────────────────────────────────────────
  const statPlayed = typeof window !== 'undefined' ? parseInt(localStorage.getItem('logicall_typerace_played') || '0') : 0
  const statMaxWpm = typeof window !== 'undefined' ? parseInt(localStorage.getItem('logicall_typerace_max_wpm') || '0') : 0
  const statMaxCpm = typeof window !== 'undefined' ? parseInt(localStorage.getItem('logicall_typerace_max_cpm') || '0') : 0

  const myRankIdx = leaderboard.findIndex(l => l.clientId === myClientId.current)
  const myRank = myRankIdx !== -1 ? myRankIdx + 1 : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="game-shell min-h-screen flex flex-col">
      {/* Toast container */}
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}
      </div>

      {/* Header */}
      <GameHeader
        title="Type Race"
        subtitle="Balapan mengetik cepat Bahasa Indonesia"
        connectionStatus={isMultiplayer ? (isHost ? `Host: ${roomCode}` : `Tamu: ${roomCode}`) : 'Mode Solo'}
        connectionDot={isMultiplayer ? (isHost ? 'host' : 'guest') : 'solo'}
        playerRoleBadge={isMultiplayer ? (isHost ? 'HOST' : 'TAMU') : null}
        onBack={() => { leaveVersusRoom(); router.push('/') }}
        onRestart={() => { if (!isMultiplayer) startSoloGame(); else showToast('Hanya Host yang bisa restart!') }}
        onStats={() => setShowStats(true)}
        onHelp={() => setShowHelp(true)}
        username={username}
        onUsernameChange={handleUsernameChange}
      />

      {/* Multiplayer Lobby */}
      <section className="relative z-10 max-w-3xl w-full mx-auto px-4 mt-4">
        <div className="rounded p-4 flex flex-col gap-3" style={{ background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}>
          <div className="flex justify-between items-center pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              <i className="fa-solid fa-users mr-1" style={{ color: 'var(--color-gold-dim)' }} />Lobi Type Race Versus
            </span>
          </div>

          {/* Solo bot selector */}
          {!isMultiplayer && (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold" style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-serif)' }}>Mode Balapan Solo</span>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Lawan komputer (Bot)</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: '#0a0804', border: '1px solid var(--color-border)' }}>
                  <span className="text-[10px] font-bold mr-1" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Bot:</span>
                  <select
                    value={botCount}
                    onChange={e => { const n = parseInt(e.target.value); setBotCount(n); setupSoloBots(n) }}
                    className="classic-input py-1 px-2.5 rounded text-xs font-bold focus:outline-none cursor-pointer"
                    style={{
                      color: 'var(--color-gold)',
                      background: 'linear-gradient(180deg, #1e1508, #0a0804)',
                      borderColor: 'var(--color-gold-dim)',
                    }}
                  >
                    {[1,2,3].map(n => <option key={n} value={n} style={{ background: '#1e1508', color: 'var(--color-gold)' }}>{n} Bot</option>)}
                  </select>
                </div>
                <button
                  onClick={startSoloGame}
                  disabled={phase === 'countdown' || phase === 'playing'}
                  className="brass-btn py-2 px-4 text-[11px]"
                >
                  <i className="fa-solid fa-play" /> Mulai Balapan Solo
                </button>
              </div>
            </div>
          )}

          {/* Create & Join */}
          {!showRoomInfo && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Kapasitas Room</label>
                <div className="flex gap-2">
                  <select
                    value={maxPlayers}
                    onChange={e => setMaxPlayers(parseInt(e.target.value))}
                    className="flex-1 rounded px-2.5 py-1.5 text-xs font-bold focus:outline-none"
                    style={{ background: '#0a0804', border: '1px solid var(--color-border)', color: 'var(--color-ivory)', fontFamily: 'var(--font-mono)' }}
                  >
                    {[2,3,4,6,8].map(n => <option key={n} value={n}>{n} Pemain</option>)}
                  </select>
                  <button onClick={createVersusRoom} className="brass-btn px-3 py-1.5 text-[10px]">
                    <i className="fa-solid fa-users" /> Buat Room
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Gabung Room Lain</label>
                <div className="flex gap-2">
                  <input
                    type="text" placeholder="Kode Room"
                    className="classic-input flex-1"
                    id="room-code-input"
                    onKeyDown={e => e.key === 'Enter' && joinVersusRoom((e.target as HTMLInputElement).value)}
                  />
                  <button onClick={() => joinVersusRoom((document.getElementById('room-code-input') as HTMLInputElement)?.value)} className="brass-btn px-3 py-1.5 text-[10px]">Gabung</button>
                </div>
              </div>
            </div>
          )}

          {/* Room info */}
          {showRoomInfo && (
            <div className="flex flex-col gap-2 p-2.5 rounded" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }}>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Undang Teman Anda:</p>
              <div className="flex gap-2">
                <input readOnly value={shareLink} className="flex-grow text-[10px] rounded px-2 py-1 focus:outline-none" style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }} />
                <button onClick={copyRoomCode} className="brass-btn px-2 py-1 text-[9px]">Salin Kode</button>
                <button onClick={copyRoomLink} className="brass-btn px-2 py-1 text-[9px]">Salin Link</button>
              </div>
              <div className="flex gap-2 mt-1">
                {isHost && !isSharedToLobby && (
                  <button onClick={shareRoomToLobby} className="flex-1 py-2 rounded text-[10px] font-bold flex items-center justify-center gap-1" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)', fontFamily: 'var(--font-mono)' }}>
                    <i className="fa-solid fa-share-nodes" /> Bagikan ke Lobby Portal
                  </button>
                )}
                {isHost && isSharedToLobby && (
                  <div className="flex-1 py-2 rounded text-[10px] font-bold flex items-center justify-center gap-1 opacity-60" style={{ background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', fontFamily: 'var(--font-mono)' }}>
                    <i className="fa-solid fa-circle-check" /> Telah Dibagikan
                  </div>
                )}
                {isHost && players.length >= 2 && (
                  <button
                    onClick={startVersusGame}
                    disabled={isStartingGame || phase === 'countdown' || phase === 'playing' || countdownActive}
                    className="flex-1 py-2 rounded text-[10px] font-bold flex items-center justify-center gap-1"
                    style={{
                      background: (isStartingGame || phase === 'countdown' || phase === 'playing' || countdownActive) ? 'rgba(80,80,80,0.2)' : 'var(--color-gold)',
                      color: (isStartingGame || phase === 'countdown' || phase === 'playing' || countdownActive) ? '#666' : '#1a1208',
                      border: '1px solid var(--color-gold-dim)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    Mulai Game Balapan
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Players list */}
          {showRoomInfo && players.length > 0 && (
            <div className="flex flex-col gap-1.5 p-2.5 rounded" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)' }}>
              <span className="text-[9px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Daftar Pemain ({players.length}/{maxPlayers})</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {players.map(p => (
                  <div key={p.clientId} className="flex items-center justify-between p-2 rounded" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }}>
                    <span className="flex items-center gap-1.5 text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-ivory)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.isMe ? '#4ade80' : '#60a5fa' }} />
                      {escapeHTML(p.username)}
                      {p.isMe && <span className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>(Anda)</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded-sm" style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--color-gold-dim)', border: '1px solid rgba(201,162,39,0.2)', fontFamily: 'var(--font-mono)' }}>{p.isHost ? 'Host' : 'Tamu'}</span>
                      {isHost && !p.isMe && (
                        <button onClick={() => kickPlayer(p.clientId)} className="text-[8px] px-1 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', fontFamily: 'var(--font-mono)' }}>Kick</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={leaveVersusRoom} className="w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)', fontFamily: 'var(--font-mono)' }}>
                <i className="fa-solid fa-arrow-right-from-bracket" />
                {isHost ? 'Tutup Room' : 'Keluar Room'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Main game area */}
      <main className="relative z-10 flex-grow w-full max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4">
        {/* Race tracks */}
        <div className="rounded p-4 flex flex-col gap-3" style={{ background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest block pb-1.5 mb-1" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', borderBottom: '1px solid var(--color-border)' }}>
            ✦ Papan Balapan (Lintasan)
          </span>
          {phase === 'idle' && opponents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
              <i className="fa-solid fa-flag-checkered text-3xl mb-2" style={{ color: 'var(--color-border-glow)' }} />
              <p className="text-xs" style={{ fontFamily: 'var(--font-mono)' }}>Tekan &ldquo;Mulai&rdquo; untuk memulai balapan!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <RaceTrack username={username} isMe wpm={wpm} progress={myProgress} accentColor="var(--color-gold)" />
              {opponents.map((opp, i) => (
                <RaceTrack
                  key={opp.clientId}
                  username={opp.username}
                  wpm={opp.finishedTime !== null ? opp.wpm : opp.currentWpm}
                  progress={opp.finishedTime !== null ? 100 : opp.progress}
                  accentColor={accentColors[i % accentColors.length]}
                />
              ))}
            </div>
          )}
        </div>

        {/* Gameplay area */}
        <div className="rounded p-4 flex flex-col gap-4 relative" style={{ background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}>
          {/* Timer badge */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Ketik Paragraf Berikut:</span>
            <div className="px-2.5 py-1 rounded text-[10px] font-bold" style={{ background: '#0a0804', border: '1px solid var(--color-border)', color: 'var(--color-gold)', fontFamily: 'var(--font-mono)' }}>
              Sisa: <span>{remainingSeconds}</span>s
            </div>
          </div>

          {/* Passage */}
          <div
            className="text-sm sm:text-base leading-relaxed p-3.5 rounded select-none min-h-[80px]"
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid var(--color-border)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
            }}
          >
            <PassageDisplay
              words={quoteWords}
              currentWordIndex={currentWordIndex}
              inputVal={inputVal}
              phase={phase}
            />
          </div>

          {/* Input */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={handleInput}
              disabled={phase !== 'playing'}
              placeholder={phase === 'idle' ? "Tekan 'Mulai' untuk memulai balapan!" : phase === 'countdown' ? 'Bersiap...' : 'Ketik paragraf di atas di sini...'}
              className="w-full rounded px-4 py-3 text-sm sm:text-base font-bold focus:outline-none transition"
              style={{
                background: '#0a0804',
                border: `2px solid ${hasTypo ? '#ef4444' : phase === 'playing' ? 'var(--color-gold-dim)' : 'var(--color-border)'}`,
                color: 'var(--color-ivory)',
                fontFamily: 'var(--font-mono)',
                boxShadow: hasTypo ? '0 0 8px rgba(239,68,68,0.2)' : phase === 'playing' ? '0 0 8px rgba(201,162,39,0.1)' : 'none',
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {/* Countdown overlay */}
            {phase === 'countdown' && <CountdownOverlay count={countdownVal} />}
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3 text-center mt-1">
            {[
              { label: 'WPM (Kata/Mnt)', value: wpm, color: 'var(--color-gold)' },
              { label: 'CPM (Karakter/Mnt)', value: cpm, color: 'var(--color-gold)' },
              { label: 'Selesai', value: `${progressPct}%`, color: 'var(--color-ivory)' },
            ].map(m => (
              <div key={m.label} className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }}>
                <span className="text-base sm:text-lg font-black" style={{ color: m.color, fontFamily: 'var(--font-mono)' }}>{m.value}</span>
                <span className="text-[8px] font-bold uppercase tracking-wider block" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-[10px]" style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>
        © 2026 Logicall Type Race
      </footer>

      {/* ── HELP MODAL ── */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded p-6 flex flex-col" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between pb-3 mb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <h3 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--color-ivory)', fontFamily: 'var(--font-serif)' }}>
                <i className="fa-solid fa-circle-question" style={{ color: 'var(--color-gold-dim)' }} /> Cara Bermain
              </h3>
              <button onClick={() => setShowHelp(false)} style={{ color: 'var(--color-text-muted)' }}><i className="fa-solid fa-xmark" /></button>
            </div>
            <div className="text-xs space-y-3 leading-relaxed" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              <p className="font-semibold" style={{ color: 'var(--color-ivory)' }}>Aturan Dasar:</p>
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li>Ketik kalimat bahasa Indonesia yang ditampilkan kata demi kata.</li>
                <li>Gunakan <strong>keyboard bawaan</strong> perangkat Anda.</li>
                <li>Tekan <kbd className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: '#1e1508', border: '1px solid var(--color-border)', color: 'var(--color-ivory)' }}>Spasi</kbd> setelah tiap kata yang benar.</li>
                <li>Kata terakhir tidak perlu spasi.</li>
              </ul>
              <p className="text-[10px] italic p-2.5 rounded" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }}>
                WPM = (karakter benar / 5) / menit. Semakin cepat, semakin jauh mobil Anda!
              </p>
            </div>
            <button onClick={() => setShowHelp(false)} className="brass-btn w-full mt-6 py-2.5 text-xs uppercase tracking-wider">Mengerti & Main</button>
          </div>
        </div>
      )}

      {/* ── STATS MODAL ── */}
      {showStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded p-6 sm:p-8 flex flex-col items-center text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <span className="text-[10px] font-extrabold px-3 py-1 rounded-sm uppercase tracking-widest block w-max mx-auto mb-2" style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--color-gold)', border: '1px solid rgba(201,162,39,0.25)', fontFamily: 'var(--font-mono)' }}>STATISTIK</span>
            <h3 className="text-2xl font-black tracking-tight mb-4" style={{ color: 'var(--color-ivory)', fontFamily: 'var(--font-serif)' }}>Hasil Balapan</h3>

            {/* Global stats */}
            <div className="grid grid-cols-3 gap-2 w-full mb-4">
              {[
                { label: 'Balapan', val: statPlayed },
                { label: 'Max WPM', val: statMaxWpm },
                { label: 'Max CPM', val: statMaxCpm },
              ].map(s => (
                <div key={s.label} className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }}>
                  <span className="text-lg font-black" style={{ color: 'var(--color-ivory)', fontFamily: 'var(--font-mono)' }}>{s.val}</span>
                  <span className="text-[8px] font-bold uppercase tracking-wider block" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Last performance */}
            {myFinished && (
              <div className="w-full p-4 rounded mb-4 text-left" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }}>
                <span className="text-[9px] font-bold uppercase tracking-wider text-center block mb-2" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Performa Terakhir</span>
                {[
                  { label: 'Posisi Akhir', val: myRank ? (myRank === 1 ? '🏆 Juara 1' : `Peringkat ${myRank}`) : '-' },
                  { label: 'Kecepatan', val: `${myFinished.wpm} WPM / ${myFinished.cpm} CPM` },
                  { label: 'Waktu', val: myFinished.finishedTime !== null ? `${myFinished.time} detik` : `Gagal (${myFinished.progress}%)` },
                  { label: 'Akurasi', val: `${myFinished.accuracy}%` },
                ].map(r => (
                  <div key={r.label} className="flex justify-between text-xs py-1" style={{ borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{r.label}:</span>
                    <strong style={{ color: 'var(--color-gold-light)' }}>{r.val}</strong>
                  </div>
                ))}
              </div>
            )}

            {/* Leaderboard */}
            {leaderboard.length > 0 && (
              <div className="w-full mb-4 text-left">
                <span className="text-[9px] font-bold uppercase tracking-widest block mb-2" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Klasemen Balapan</span>
                <div className="flex flex-col gap-1">
                  {leaderboard.map((entry, i) => (
                    <div key={entry.clientId} className="flex items-center justify-between p-2 rounded text-xs" style={{ background: i === 0 ? 'rgba(201,162,39,0.1)' : 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: i === 0 ? 'var(--color-gold)' : 'var(--color-text-muted)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`} {escapeHTML(entry.username)}
                        {entry.isBot && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}> [Bot]</span>}
                      </span>
                      <span style={{ color: 'var(--color-ivory)' }}>
                        {entry.unfinished ? `${entry.progress ?? 0}%` : `${entry.wpm} WPM`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 w-full">
              <button
                onClick={() => {
                  setShowStats(false)
                  if (isMultiplayer) {
                    leaveVersusRoom()
                    router.push('/')
                  }
                }}
                className="flex-1 py-3 rounded text-xs font-bold uppercase tracking-wider"
                style={{
                  background: isMultiplayer ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.3)',
                  color: isMultiplayer ? '#f87171' : 'var(--color-text-muted)',
                  border: isMultiplayer ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--color-border)',
                  fontFamily: 'var(--font-mono)'
                }}
              >
                {isMultiplayer ? 'Keluar Lobi' : 'Tutup'}
              </button>
              <button
                onClick={() => {
                  if (isMultiplayer) {
                    if (isHost) {
                      setShowStats(false)
                      startVersusGame()
                    }
                  } else {
                    setShowStats(false)
                    startSoloGame()
                  }
                }}
                disabled={isMultiplayer && !isHost}
                className="brass-btn flex-1 py-3 text-xs uppercase tracking-wider font-bold"
                style={{
                  opacity: (isMultiplayer && !isHost) ? 0.5 : 1,
                  cursor: (isMultiplayer && !isHost) ? 'not-allowed' : 'pointer'
                }}
              >
                {isMultiplayer ? (isHost ? 'Main Lagi' : 'Menunggu Host...') : 'Main Lagi'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Guest Waiting Overlay */}
      {isMultiplayer && !isHost && !versusStarted && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-40">
          <div className="classic-card ornate-border p-6 text-center max-w-sm w-full mx-4">
            <i className="fa-solid fa-hourglass-half text-4xl text-[var(--color-gold)] mb-4 animate-pulse" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-gold)] mb-2">Menunggu Host</h3>
            <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed mb-4">
              Anda telah bergabung sebagai tamu. Harap tunggu hingga host memulai permainan.
            </p>
            <button
              onClick={() => {
                leaveVersusRoom()
                router.push('/')
              }}
              className="brass-btn w-full py-2 text-[10px] tracking-wider uppercase font-bold"
            >
              Keluar Lobi
            </button>
          </div>
        </div>
      )}

      {/* Countdown Overlay */}
      {countdownActive && (
        <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
          <div className="flex items-center gap-4">
            <span
              className="text-6xl font-extrabold"
              style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-mono)' }}
            >
              {countdownCount > 0 ? countdownCount : 'GO!'}
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] font-mono mt-4">
            Game Dimulai Dalam...
          </span>
        </div>
      )}
    </div>
  )
}
