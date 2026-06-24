'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Swal from 'sweetalert2'
import { supabase } from '@/lib/supabase'
import { generateRoomCode, getOrCreateUsername, saveUsername, escapeHTML } from '@/lib/utils'
import GameHeader from '@/components/shared/GameHeader'
import MultiplayerLobby, { PlayerInfo } from '@/components/shared/MultiplayerLobby'

const GRID_COLUMNS = ['B', 'I', 'N', 'G', 'O']
const COL_RANGES: Record<string, { min: number; max: number }> = {
  'B': { min: 1, max: 15 },
  'I': { min: 16, max: 30 },
  'N': { min: 31, max: 45 },
  'G': { min: 46, max: 60 },
  'O': { min: 61, max: 75 }
}

interface OpponentState {
  clientId: string
  username: string
  marked: boolean[][]
  board: (number | 'FREE')[][]
  isBot: boolean
  status: 'playing' | 'bingo1' | 'bingo2' | 'won'
  stageCompleted: number
}

export default function BingoGame() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // --- USER STATE ---
  const [username, setUsername] = useState('')
  const myClientId = useRef(Math.random().toString(36).substring(2, 9))

  // --- GAME CONFIG/STATE ---
  const [myBoard, setMyBoard] = useState<(number | 'FREE')[][]>([])
  const [myMarked, setMyMarked] = useState<boolean[][]>(Array(5).fill(null).map(() => Array(5).fill(false)))
  const numbersPoolRef = useRef<number[]>([])
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([])
  const [currentStage, setCurrentStage] = useState(1)
  const [gameActive, setGameActive] = useState(false)
  const [drawSpeedMs] = useState(7500)
  const [ttsMuted, setTtsMuted] = useState(false)
  const [opponents, setOpponents] = useState<OpponentState[]>([])

  // --- COUNTDOWN STATE ---
  const [countdownActive, setCountdownActive] = useState(false)
  const [countdownCount, setCountdownCount] = useState(5)
  const [isStartingGame, setIsStartingGame] = useState(false)
  const [versusStarted, setVersusStarted] = useState(false)

  // --- MULTIPLAYER STATE ---
  const [isMultiplayer, setIsMultiplayer] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [isSharedToLobby, setIsSharedToLobby] = useState(false)
  const [showRoomInfo, setShowRoomInfo] = useState(false)
  const [shareLink, setShareLink] = useState('')

  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lobbyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const autoDrawIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // --- TOAST STATE ---
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])
  const toastId = useRef(0)

  const showToast = useCallback((msg: string) => {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2200)
  }, [])

  // --- TTS ANNOUNCEMENT ---
  const announceNumber = (letter: string, val: number) => {
    if (ttsMuted) return
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(`${letter}, ${val}`)
        utterance.lang = 'id-ID'
        utterance.rate = 1.0
        utterance.pitch = 1.1
        window.speechSynthesis.speak(utterance)
      }
    } catch (e) {
      console.error("Speech Synthesis failed:", e)
    }
  }

  const announceVoice = (text: string) => {
    if (ttsMuted) return
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'id-ID'
        utterance.rate = 0.95
        window.speechSynthesis.speak(utterance)
      }
    } catch (e) {
      console.error("Speech Synthesis failed:", e)
    }
  }

  // --- CARD GENERATOR ---
  const generateBingoCard = () => {
    const colPulls: Record<string, number[]> = {}
    GRID_COLUMNS.forEach(col => {
      const { min, max } = COL_RANGES[col]
      const pool: number[] = []
      for (let i = min; i <= max; i++) pool.push(i)
      // Shuffle pool
      const shuffled = shuffleArray(pool)
      colPulls[col] = shuffled.slice(0, 5)
    })

    const newBoard: (number | 'FREE')[][] = []
    for (let r = 0; r < 5; r++) {
      const rowData: (number | 'FREE')[] = []
      GRID_COLUMNS.forEach((col, cIdx) => {
        if (r === 2 && cIdx === 2) {
          rowData.push('FREE')
        } else {
          rowData.push(colPulls[col][r])
        }
      })
      newBoard.push(rowData)
    }

    const initialMarked = Array(5).fill(null).map(() => Array(5).fill(false))
    initialMarked[2][2] = true

    setMyBoard(newBoard)
    setMyMarked(initialMarked)
  }

  const shuffleArray = <T,>(array: T[]): T[] => {
    const copy = [...array]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  // --- BOT GENERATOR ---
  const generateBots = (count: number): OpponentState[] => {
    const names = ["Andi Bot", "Budi Bot", "Citra Bot", "Dedi Bot"]
    const botArray: OpponentState[] = []

    for (let i = 0; i < count; i++) {
      const botName = names[i % names.length]
      const botCard: (number | 'FREE')[][] = []
      const botMarked = Array(5).fill(null).map(() => Array(5).fill(false))
      botMarked[2][2] = true

      const colPulls: Record<string, number[]> = {}
      GRID_COLUMNS.forEach(col => {
        const { min, max } = COL_RANGES[col]
        const pool: number[] = []
        for (let j = min; j <= max; j++) pool.push(j)
        const shuffled = shuffleArray(pool)
        colPulls[col] = shuffled.slice(0, 5)
      })

      for (let r = 0; r < 5; r++) {
        const rowData: (number | 'FREE')[] = []
        GRID_COLUMNS.forEach((col, cIdx) => {
          if (r === 2 && cIdx === 2) {
            rowData.push('FREE')
          } else {
            rowData.push(colPulls[col][r])
          }
        })
        botCard.push(rowData)
      }

      botArray.push({
        clientId: `bot-${i}`,
        username: botName,
        board: botCard,
        marked: botMarked,
        isBot: true,
        status: 'playing',
        stageCompleted: 0
      })
    }
    return botArray
  }

  // --- LOAD INITIAL CONFIG ---
  useEffect(() => {
    const uname = getOrCreateUsername()
    setUsername(uname)

    const audioPref = localStorage.getItem('logicall_bingo_tts_muted')
    if (audioPref !== null) {
      setTtsMuted(audioPref === 'true')
    }

    const roomParam = searchParams.get('room')
    if (roomParam) {
      setTimeout(() => {
        joinVersusRoom(roomParam.trim().toUpperCase())
      }, 300)
    } else {
      generateBingoCard()
      setOpponents(generateBots(1))
    }

    return () => {
      clearDrawInterval()
      if (roomChannelRef.current) supabase.removeChannel(roomChannelRef.current)
      if (lobbyChannelRef.current) supabase.removeChannel(lobbyChannelRef.current)
    }
  }, []) // eslint-disable-line

  useEffect(() => {
    if (isMultiplayer && isHost && isSharedToLobby && lobbyChannelRef.current) {
      lobbyChannelRef.current.track({
        roomCode,
        game: 'bingo',
        hostName: username,
        playerCount: players.length,
        maxPlayers,
        updatedAt: new Date().toISOString()
      })
    }
  }, [players.length, maxPlayers, username, isMultiplayer, isHost, isSharedToLobby, roomCode])

  const clearDrawInterval = () => {
    if (autoDrawIntervalRef.current) {
      clearInterval(autoDrawIntervalRef.current)
      autoDrawIntervalRef.current = null
    }
  }

  // --- CELL INTERACTION ---
  const handleCellClick = (row: number, col: number) => {
    if (!gameActive) return
    const cellVal = myBoard[row][col]

    if (cellVal === 'FREE') return

    if (!drawnNumbers.includes(cellVal)) {
      showToast(`Angka ${cellVal} belum ditarik!`)
      return
    }

    if (myMarked[row][col]) return

    const nextMarked = myMarked.map(rowArr => [...rowArr])
    nextMarked[row][col] = true
    setMyMarked(nextMarked)

    if (isMultiplayer && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'bingo-board-update',
        payload: { clientId: myClientId.current, marked: nextMarked }
      })
    }

    checkWinProgress(nextMarked)
  }

  const getCompletedLines = (markedGrid: boolean[][]) => {
    let completedLines = 0

    // Rows
    for (let r = 0; r < 5; r++) {
      if (markedGrid[r].every(val => val)) completedLines++
    }

    // Columns
    for (let c = 0; c < 5; c++) {
      let colFilled = true
      for (let r = 0; r < 5; r++) {
        if (!markedGrid[r][c]) {
          colFilled = false
          break
        }
      }
      if (colFilled) completedLines++
    }

    // Diagonals
    let diag1Filled = true
    for (let i = 0; i < 5; i++) {
      if (!markedGrid[i][i]) {
        diag1Filled = false
        break
      }
    }
    if (diag1Filled) completedLines++

    let diag2Filled = true
    for (let i = 0; i < 5; i++) {
      if (!markedGrid[i][4 - i]) {
        diag2Filled = false
        break
      }
    }
    if (diag2Filled) completedLines++

    return completedLines
  }

  const checkWinProgress = (markedGrid: boolean[][]) => {
    const lines = getCompletedLines(markedGrid)
    const isFullHouse = markedGrid.every(row => row.every(val => val))

    if (currentStage === 1 && lines >= 1) {
      triggerStageCompletion(1, username, myClientId.current)
    } else if (currentStage === 2 && lines >= 2) {
      triggerStageCompletion(2, username, myClientId.current)
    } else if (currentStage === 3 && isFullHouse) {
      triggerStageCompletion(3, username, myClientId.current)
    }
  }

  const triggerStageCompletion = (stage: number, achieverName: string, achieverId: string) => {
    if (!gameActive) return

    if (isMultiplayer && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'bingo-stage-complete',
        payload: { stage, achieverName, achieverId }
      })
    }

    resolveStageComplete(stage, achieverName, achieverId)
  }

  const resolveStageComplete = (stage: number, achieverName: string, achieverId: string) => {
    const isMe = achieverId === myClientId.current

    clearDrawInterval()
    announceVoice(`Bingo! ${isMe ? 'Anda' : achieverName} Bingo!`)

    if (stage === 1 && currentStage === 1) {
      setCurrentStage(2)
      setOpponents(prev =>
        prev.map(o => o.clientId === achieverId ? { ...o, status: 'bingo1', stageCompleted: 1 } : o)
      )

      Swal.fire({
        title: 'BINGO!',
        html: `
          <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--color-text);">
            <h3 style="color: var(--color-gold); font-size: 1.1rem; font-weight: bold; margin-bottom: 8px;">${escapeHTML(achieverName)} BINGO!</h3>
            <p>Berhasil menyelesaikan <b>Tahap 1 (1 Baris)</b>.</p>
            <p style="margin-top: 10px; color: var(--color-text-muted);">Game otomatis dilanjutkan ke target baru:<br/><strong style="color: var(--color-gold);">Tahap 2: 2 Baris Bingo</strong></p>
          </div>
        `,
        icon: 'success',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text)',
        showConfirmButton: false,
        timer: 4500,
        timerProgressBar: true,
        customClass: { popup: 'ornate-border classic-card' }
      }).then(() => {
        if (gameActive) {
          startDrawnTimer()
        }
      })

    } else if (stage === 2 && currentStage === 2) {
      setCurrentStage(3)
      setOpponents(prev =>
        prev.map(o => o.clientId === achieverId ? { ...o, status: 'bingo2', stageCompleted: 2 } : o)
      )

      Swal.fire({
        title: 'BINGO!',
        html: `
          <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--color-text);">
            <h3 style="color: var(--color-gold); font-size: 1.1rem; font-weight: bold; margin-bottom: 8px;">${escapeHTML(achieverName)} BINGO!</h3>
            <p>Berhasil menyelesaikan <b>Tahap 2 (2 Baris)</b>.</p>
            <p style="margin-top: 10px; color: var(--color-text-muted);">Game otomatis dilanjutkan ke target final:<br/><strong style="color: #f87171;">Tahap 3: Full House (Coret Semua Kotak)</strong></p>
          </div>
        `,
        icon: 'success',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text)',
        showConfirmButton: false,
        timer: 4500,
        timerProgressBar: true,
        customClass: { popup: 'ornate-border classic-card' }
      }).then(() => {
        if (gameActive) {
          startDrawnTimer()
        }
      })

    } else if (stage === 3 && currentStage === 3) {
      setGameActive(false)
      setOpponents(prev =>
        prev.map(o => o.clientId === achieverId ? { ...o, status: 'won', stageCompleted: 3 } : o)
      )

      Swal.fire({
        title: isMe ? '🏆 Kemenangan!' : '💀 Game Selesai!',
        html: `
          <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--color-text);">
            <h3 style="color: var(--color-gold); font-size: 1.2rem; font-weight: bold; margin-bottom: 8px;">${escapeHTML(achieverName)} BINGO!</h3>
            <p>Berhasil mencentang seluruh angka kartu <b>(Full House)</b>!</p>
            ${isMultiplayer && !isHost ? '<div style="margin-top: 15px; padding: 8px; border: 1px dashed var(--color-gold-dim); color: var(--color-gold); font-size: 0.75rem; font-weight: bold; animation: pulse 2s infinite;">Menunggu Host memulai kembali...</div>' : ''}
          </div>
        `,
        icon: isMe ? 'success' : 'error',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text)',
        showCancelButton: true,
        showConfirmButton: !isMultiplayer || isHost,
        confirmButtonText: 'Main Lagi',
        cancelButtonText: 'Menu Utama',
        reverseButtons: true,
        allowOutsideClick: false,
        customClass: { popup: 'ornate-border classic-card' }
      }).then((res) => {
        if (res.isConfirmed) {
          if (isMultiplayer) {
            if (isHost) startVersusGame()
          } else {
            startSoloGame()
          }
        } else if (res.dismiss === Swal.DismissReason.cancel) {
          leaveVersusRoom()
          router.push('/')
        }
      })
    }
  }

  // --- DRAW PROCESS ---
  const startDrawnTimer = () => {
    clearDrawInterval()
    if (isMultiplayer && !isHost) return

    autoDrawIntervalRef.current = setInterval(() => {
      const drawnVal = numbersPoolRef.current.pop()
      if (drawnVal === undefined) {
        clearDrawInterval()
        showToast("Semua 75 angka telah ditarik!")
        return
      }

      setDrawnNumbers(prevDrawn => {
        if (prevDrawn.includes(drawnVal)) return prevDrawn
        const nextDrawn = [...prevDrawn, drawnVal]

        let letter = 'B'
        if (drawnVal <= 15) letter = 'B'
        else if (drawnVal <= 30) letter = 'I'
        else if (drawnVal <= 45) letter = 'N'
        else if (drawnVal <= 60) letter = 'G'
        else letter = 'O'

        announceNumber(letter, drawnVal)

        if (!isMultiplayer) {
          tickBots(drawnVal)
        }

        if (isMultiplayer && roomChannelRef.current) {
          roomChannelRef.current.send({
            type: 'broadcast',
            event: 'bingo-draw-ball',
            payload: { val: drawnVal, letter, history: nextDrawn }
          })
        }

        return nextDrawn
      })
    }, drawSpeedMs)
  }

  const tickBots = (drawnVal: number) => {
    setOpponents(prevOpponents => {
      return prevOpponents.map(bot => {
        if (bot.status === 'won') return bot

        const hasNum = bot.board.some(row => row.includes(drawnVal))
        if (!hasNum) return bot

        const nextMarked = bot.marked.map(rowArr => [...rowArr])
        bot.board.forEach((rowArr, rIdx) => {
          rowArr.forEach((cellVal, cIdx) => {
            if (cellVal === drawnVal) {
              nextMarked[rIdx][cIdx] = true
            }
          })
        })

        // Schedule win trigger check on random delay to simulate bot reaction time
        const delay = Math.floor(Math.random() * 2000) + 500
        setTimeout(() => {
          const lines = getCompletedLines(nextMarked)
          const isFullHouse = nextMarked.every(row => row.every(val => val))

          if (currentStage === 1 && lines >= 1 && bot.stageCompleted < 1) {
            triggerStageCompletion(1, bot.username, bot.clientId)
          } else if (currentStage === 2 && lines >= 2 && bot.stageCompleted < 2) {
            triggerStageCompletion(2, bot.username, bot.clientId)
          } else if (currentStage === 3 && isFullHouse && bot.stageCompleted < 3) {
            triggerStageCompletion(3, bot.username, bot.clientId)
          }
        }, delay)

        return { ...bot, marked: nextMarked }
      })
    })
  }

  // --- START GAME SEQUENCE ---
  const triggerBingoStartSequence = (shuffledPool: number[], isVersus: boolean) => {
    clearDrawInterval()
    setVersusStarted(true)
    setCurrentStage(1)
    setDrawnNumbers([])
    numbersPoolRef.current = shuffledPool
    generateBingoCard()
    if (!isVersus) {
      setOpponents(generateBots(1))
    } else {
      setOpponents(prev =>
        prev.map(opp => ({
          ...opp,
          marked: Array(5).fill(null).map((_, r) => Array(5).fill(null).map((_, c) => r === 2 && c === 2)),
          status: 'playing',
          stageCompleted: 0
        }))
      )
    }

    if (isVersus) {
      setGameActive(false)
      setCountdownCount(5)
      setCountdownActive(true)

      const interval = setInterval(() => {
        setCountdownCount(prev => {
          if (prev <= 1) {
            clearInterval(interval)
            setCountdownActive(false)
            setGameActive(true)
            if (isHost) {
              setTimeout(() => {
                startDrawnTimer()
              }, 1000)
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      setCountdownActive(false)
      setGameActive(true)
      setTimeout(() => {
        startDrawnTimer()
      }, 1000)
    }
  }

  // --- START SOLO MODE ---
  const startSoloGame = () => {
    if (isMultiplayer) return
    const pool: number[] = []
    for (let i = 1; i <= 75; i++) pool.push(i)
    const shuffled = shuffleArray(pool)
    triggerBingoStartSequence(shuffled, false)
    showToast("Permainan Solo Dimulai!")
  }

  const restartSoloCard = () => {
    clearDrawInterval()
    setGameActive(false)
    setCurrentStage(1)
    setDrawnNumbers([])
    generateBingoCard()
    setOpponents(generateBots(1))
    showToast("Kartu berhasil diacak ulang!")
  }

  // --- MULTIPLAYER ROOM ACTIONS ---
  const setupSupabaseVersus = (code: string, amIHost: boolean) => {
    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current)
    }

    const uname = getOrCreateUsername()
    const ch = supabase.channel(`bingo-room-${code}`, {
      config: { presence: { key: myClientId.current } }
    })

    ch
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        const list: PlayerInfo[] = []

        Object.values(state).forEach((arr: any) => {
          arr.forEach((p: any) => {
            list.push({
              clientId: p.clientId,
              username: p.username,
              isHost: p.isHost,
              isMe: p.clientId === myClientId.current
            })
          })
        })

        list.sort((a, b) => (a.isHost ? -1 : 1))
        setPlayers(list)

        const hostExists = list.some(p => p.isHost)
        if (list.length > 0 && !hostExists && !amIHost) {
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
            router.push('/')
          })
          return
        }

        const activeClientIds = new Set(list.map(p => p.clientId))

        setOpponents(prev => {
          const otherPlayers = list.filter(p => p.clientId !== myClientId.current)
          return otherPlayers.map(p => {
            const existing = prev.find(o => o.clientId === p.clientId)
            return {
              clientId: p.clientId,
              username: p.username,
              marked: existing ? existing.marked : Array(5).fill(null).map((_, r) => Array(5).fill(null).map((_, c) => r === 2 && c === 2)),
              board: existing ? existing.board : Array(5).fill(null).map(() => Array(5).fill(0)),
              isBot: false,
              status: existing ? existing.status : 'playing',
              stageCompleted: existing ? existing.stageCompleted : 0
            }
          })
        })

        if (list.length > maxPlayers) {
          showToast("Room penuh!")
          leaveVersusRoom()
        }
      })
      .on('broadcast', { event: 'bingo-start' }, () => {
        Swal.close() // Dismiss waiting alert on Guest
        clearDrawInterval()
        setCurrentStage(1)
        generateBingoCard()
        setDrawnNumbers([])
        setOpponents(prev =>
          prev.map(opp => ({
            ...opp,
            marked: Array(5).fill(null).map((_, r) => Array(5).fill(null).map((_, c) => r === 2 && c === 2)),
            status: 'playing',
            stageCompleted: 0
          }))
        )
        setGameActive(false)
        setVersusStarted(true)
        setCountdownCount(5)
        setCountdownActive(true)

        const interval = setInterval(() => {
          setCountdownCount(prev => {
            if (prev <= 1) {
              clearInterval(interval)
              setCountdownActive(false)
              setGameActive(true)
              return 0
            }
            return prev - 1
          })
        }, 1000)

        showToast("Bingo Dimulai!")
      })
      .on('broadcast', { event: 'bingo-draw-ball' }, ({ payload }) => {
        const { val, letter, history } = payload
        setDrawnNumbers(history)
        announceNumber(letter, val)
      })
      .on('broadcast', { event: 'bingo-board-update' }, ({ payload }) => {
        const { clientId, marked } = payload
        setOpponents(prev =>
          prev.map(o => o.clientId === clientId ? { ...o, marked } : o)
        )
      })
      .on('broadcast', { event: 'bingo-stage-complete' }, ({ payload }) => {
        const { stage, achieverName, achieverId } = payload
        resolveStageComplete(stage, achieverName, achieverId)
      })
      .on('broadcast', { event: 'bingo-kick' }, ({ payload }) => {
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
      .on('broadcast', { event: 'bingo-close' }, () => {
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
          await ch.track({
            clientId: myClientId.current,
            username: uname,
            isHost: amIHost,
            maxPlayers: amIHost ? maxPlayers : null,
            joinedAt: new Date().toISOString()
          })
          if (!amIHost) showToast("Berhasil bergabung ke room!")
        }
      })

    roomChannelRef.current = ch
  }

  const createVersusRoom = (capacity: number) => {
    const code = generateRoomCode(5)
    setRoomCode(code)
    setMaxPlayers(capacity)
    setIsMultiplayer(true)
    setIsHost(true)
    setShowRoomInfo(true)
    setShareLink(`${window.location.origin}/bingo?room=${code}`)
    setGameActive(false)
    setupSupabaseVersus(code, true)
    setVersusStarted(false)
    showToast("Room dibuat!")
    generateBingoCard()
    setOpponents([])
  }

  const joinVersusRoom = (code: string) => {
    const sanitized = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    if (!sanitized || sanitized.length < 5) {
      showToast("Kode room tidak valid!")
      return
    }
    setRoomCode(sanitized)
    setIsMultiplayer(true)
    setIsHost(false)
    setShowRoomInfo(true)
    setShareLink(`${window.location.origin}/bingo?room=${sanitized}`)
    setGameActive(false)
    setupSupabaseVersus(sanitized, false)
    setVersusStarted(false)
  }

  const leaveVersusRoom = () => {
    clearDrawInterval()
    if (isHost && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'bingo-close',
        payload: {}
      })
    }
    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current)
      roomChannelRef.current = null
    }
    if (lobbyChannelRef.current) {
      supabase.removeChannel(lobbyChannelRef.current)
      lobbyChannelRef.current = null
    }
    setIsMultiplayer(false)
    setIsHost(false)
    setRoomCode('')
    setPlayers([])
    setOpponents([])
    setShowRoomInfo(false)
    setIsSharedToLobby(false)
    setGameActive(false)
    setVersusStarted(false)
    setCurrentStage(1)
    generateBingoCard()
    setOpponents(generateBots(1))
    showToast("Keluar dari room. Kembali ke Mode Solo.")
  }

  const shareRoomToLobby = () => {
    if (lobbyChannelRef.current) {
      supabase.removeChannel(lobbyChannelRef.current)
    }

    const ch = supabase.channel('arcade-lobby', {
      config: { presence: { key: myClientId.current } }
    })

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setIsSharedToLobby(true)
        await ch.track({
          roomCode,
          game: 'bingo',
          hostName: username,
          playerCount: players.length,
          maxPlayers,
          updatedAt: new Date().toISOString()
        })
        showToast("Room dibagikan ke Lobby!")
      }
    })

    lobbyChannelRef.current = ch
  }

  const kickPlayer = (clientId: string) => {
    if (!roomChannelRef.current) return
    roomChannelRef.current.send({
      type: 'broadcast',
      event: 'bingo-kick',
      payload: { targetClientId: clientId }
    })
  }

  const startVersusGame = async () => {
    if (!isHost || players.length < 2 || !roomChannelRef.current) {
      showToast("Butuh minimal 2 pemain!")
      return
    }

    setIsStartingGame(true)

    const pool: number[] = []
    for (let i = 1; i <= 75; i++) pool.push(i)
    const shuffledPool = shuffleArray(pool)

    await roomChannelRef.current.send({
      type: 'broadcast',
      event: 'bingo-start',
      payload: {}
    })

    Swal.close() // Close any active popup alerts
    triggerBingoStartSequence(shuffledPool, true)
    setIsStartingGame(false)
  }

  const handleUsernameChange = (val: string) => {
    setUsername(val)
    saveUsername(val)
    if (roomChannelRef.current && val.trim()) {
      roomChannelRef.current.track({
        clientId: myClientId.current,
        username: val.trim(),
        isHost,
        maxPlayers: isHost ? maxPlayers : null,
        joinedAt: new Date().toISOString()
      })
    }
  }

  // --- STATS / HELP TRIGGERS ---
  const toggleHelp = () => {
    Swal.fire({
      title: '✦ CARA BERMAIN BINGO ✦',
      html: `
        <div style="font-family: var(--font-mono); font-size: 0.75rem; text-align: left; line-height: 1.6; color: var(--color-text);">
          <p>Dapatkan angka yang ditarik. Cocokkan angka tersebut pada kartu Bingo Anda.</p>
          <p style="margin-top: 10px;">Target Kemenangan:</p>
          <ul style="padding-left: 15px; margin-top: 5px;">
            <li><b>Tahap 1:</b> Selesaikan 1 baris (vertikal, horizontal, atau diagonal).</li>
            <li><b>Tahap 2:</b> Selesaikan 2 baris terisi penuh.</li>
            <li><b>Tahap 3:</b> Coret seluruh 25 kotak angka kartu Anda (Full House).</li>
          </ul>
        </div>
      `,
      background: 'var(--color-bg-card)',
      color: 'var(--color-text)',
      confirmButtonText: 'MENGERTI',
      confirmButtonColor: 'var(--color-gold)',
      customClass: { popup: 'ornate-border classic-card' }
    })
  }

  // --- RENDER PIECES ---
  const lastDrawnVal = drawnNumbers[drawnNumbers.length - 1]
  let lastDrawnLetter = '-'
  if (lastDrawnVal) {
    if (lastDrawnVal <= 15) lastDrawnLetter = 'B'
    else if (lastDrawnVal <= 30) lastDrawnLetter = 'I'
    else if (lastDrawnVal <= 45) lastDrawnLetter = 'N'
    else if (lastDrawnVal <= 60) lastDrawnLetter = 'G'
    else lastDrawnLetter = 'O'
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode)
    showToast("Kode room disalin!")
  }

  const copyRoomLink = () => {
    navigator.clipboard.writeText(shareLink)
    showToast("Link room disalin!")
  }

  return (
    <div className="game-shell min-h-screen flex flex-col">
      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast">{t.msg}</div>
        ))}
      </div>

      {/* Header */}
      <GameHeader
        title="Bingo"
        subtitle="Dapatkan baris angka untuk menyerukan Bingo!"
        connectionStatus={isMultiplayer ? (isHost ? `Host: ${roomCode}` : `Tamu: ${roomCode}`) : 'Mode Solo'}
        connectionDot={isMultiplayer ? (isHost ? 'host' : 'guest') : 'solo'}
        playerRoleBadge={isMultiplayer ? (isHost ? 'HOST' : 'TAMU') : null}
        onBack={() => {
          leaveVersusRoom()
          router.push('/')
        }}
        onRestart={() => {
          if (isMultiplayer) {
            if (isHost) startVersusGame()
            else showToast("Hanya Host yang bisa restart!")
          } else {
            restartSoloCard()
          }
        }}
        onStats={() => {}}
        onHelp={toggleHelp}
        username={username}
        onUsernameChange={handleUsernameChange}
      />

      {/* Lobby Panel */}
      <MultiplayerLobby
        gameKey="Bingo"
        isMultiplayer={isMultiplayer}
        isHost={isHost}
        roomCode={roomCode}
        maxPlayers={maxPlayers}
        players={players}
        isSharedToLobby={isSharedToLobby}
        onCreateRoom={createVersusRoom}
        onJoinRoom={joinVersusRoom}
        onLeaveRoom={leaveVersusRoom}
        onShareLobby={shareRoomToLobby}
        onStartGame={startVersusGame}
        onKickPlayer={(cid) => kickPlayer(cid)}
        myClientId={myClientId.current}
        startBtnLabel="Mulai Game"
        startBtnDisabled={players.length < 2 || gameActive || isStartingGame || countdownActive}
        canStart={players.length >= 2}
        showRoomInfo={showRoomInfo}
        shareLink={shareLink}
        onCopyRoomCode={copyRoomCode}
        onCopyRoomLink={copyRoomLink}
        soloSettingsSlot={
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold" style={{ color: 'var(--color-gold)' }}>Mode Solo</span>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Main lawan Komputer (1 Bot)</p>
            </div>
            <button
              onClick={startSoloGame}
              disabled={gameActive}
              className="brass-btn py-2 px-4 text-[10px]"
            >
              <i className="fa-solid fa-play" /> Mulai Game Solo
            </button>
          </div>
        }
      />

      {/* Main Boards Area */}
      <main className="flex-grow flex flex-col md:flex-row items-center justify-center p-4 max-w-4xl mx-auto w-full gap-6 md:gap-12">
        {/* Called Numbers caller & history */}
        <div className="flex flex-col gap-4 w-full max-w-[240px] items-center justify-center text-center">
          <div className="flex flex-col items-center justify-center">
            <span
              className="text-[9px] font-bold uppercase tracking-wider text-center"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
            >
              Angka Dipanggil
            </span>
            <div
              id="drawn-ball"
              className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-bold font-mono tracking-wide mt-2 border-2 shadow-lg animate-pulse"
              style={{
                background: 'linear-gradient(135deg, #10b981, #047857)',
                borderColor: 'var(--color-gold)',
                color: 'var(--color-ivory)',
                textShadow: '0 2px 4px rgba(0,0,0,0.5)'
              }}
            >
              {lastDrawnVal ? `${lastDrawnLetter}-${lastDrawnVal}` : '-'}
            </div>
            <span
              id="called-count"
              className="text-[9px] font-bold tracking-wider mt-1.5"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
            >
              Total Angka: {drawnNumbers.length}/75
            </span>
          </div>

          <div
            onClick={() => {
              const nextVal = !ttsMuted
              setTtsMuted(nextVal)
              localStorage.setItem('logicall_bingo_tts_muted', String(nextVal))
            }}
            className="flex items-center gap-2 cursor-pointer p-1.5 rounded border select-none transition-all duration-200"
            style={{
              background: 'rgba(0,0,0,0.3)',
              borderColor: 'var(--color-border)',
            }}
          >
            <i
              className={ttsMuted ? "fa-solid fa-volume-xmark text-rose-400 text-xs" : "fa-solid fa-volume-high text-emerald-400 text-xs"}
            />
            <span style={{ color: 'var(--color-text)', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
              {ttsMuted ? 'SUARA: MATI' : 'SUARA: HIDUP'}
            </span>
          </div>

          <div className="w-full flex flex-col gap-1.5 align-middle justify-center items-center">
            <span
              className="text-[9px] font-bold uppercase tracking-wider text-center"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
            >
              Histori Terakhir
            </span>
            <div id="history-balls-container" className="flex gap-1 flex-wrap justify-center min-h-[28px]">
              {drawnNumbers.length === 0 ? (
                <span className="text-[10px] text-neutral-600 font-mono">Belum ada angka ditarik</span>
              ) : (
                drawnNumbers.slice(-5).reverse().map(v => {
                  let l = 'B'
                  if (v <= 15) l = 'B'
                  else if (v <= 30) l = 'I'
                  else if (v <= 45) l = 'N'
                  else if (v <= 60) l = 'G'
                  else l = 'O'
                  return (
                    <div
                      key={v}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-gold)'
                      }}
                      className="text-[10px] font-bold font-mono px-2 py-1 rounded"
                    >
                      {l}-{v}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Bingo Card grid */}
        <div className="flex flex-col gap-3">
          <div className="text-center p-2 rounded border" style={{ background: 'var(--color-bg-panel)', borderColor: 'var(--color-border)' }}>
            <span
              id="stage-title"
              className="text-[11px] font-bold uppercase tracking-widest text-amber-500 font-mono block"
            >
              {currentStage === 1 ? 'Tahap 1: 1 Baris Bingo!' : currentStage === 2 ? 'Tahap 2: 2 Baris Bingo!' : 'Tahap Final: Full House!'}
            </span>
            <span
              id="stage-desc"
              className="text-[9px] font-bold tracking-wider font-mono text-neutral-500 block mt-0.5"
            >
              {currentStage === 1
                ? 'Mencari 1 baris terisi penuh (vertikal, horizontal, atau diagonal).'
                : currentStage === 2
                ? 'Mencari 2 baris terisi penuh secara bersamaan.'
                : 'Coret seluruh 25 kotak angka pada kartu Anda untuk menang!'}
            </span>
          </div>

          <div
            id="bingo-board"
            className="grid grid-cols-5 gap-1.5 p-3 rounded classic-card overflow-hidden"
            style={{ border: '2px solid var(--color-gold-dim)' }}
          >
            {/* Headers B I N G O */}
            {GRID_COLUMNS.map(col => (
              <div
                key={col}
                className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center font-bold text-sm sm:text-base font-serif select-none"
                style={{
                  color: 'var(--color-gold)',
                  borderBottom: '2px solid var(--color-gold-dim)'
                }}
              >
                {col}
              </div>
            ))}

            {/* Cells */}
            {myBoard.map((rowArr, rIdx) =>
              rowArr.map((cellVal, cIdx) => {
                const isFree = cellVal === 'FREE'
                const isMarked = myMarked[rIdx][cIdx]

                let bg = 'rgba(10, 8, 4, 0.6)'
                let border = '1px solid var(--color-border)'
                let color = 'var(--color-ivory)'
                let cursor = 'pointer'

                if (isFree) {
                  bg = 'var(--color-gold-dim)'
                  border = '1px solid var(--color-gold)'
                  color = '#000'
                  cursor = 'default'
                } else if (isMarked) {
                  bg = 'linear-gradient(135deg, #10b981, #047857)'
                  border = '1px solid #10b981'
                  color = '#fff'
                  cursor = 'default'
                }

                return (
                  <div
                    key={`${rIdx}-${cIdx}`}
                    onClick={() => !isFree && handleCellClick(rIdx, cIdx)}
                    style={{
                      background: bg,
                      border,
                      color,
                      cursor
                    }}
                    className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center font-bold text-xs sm:text-sm font-mono rounded select-none hover:border-neutral-500 transition-colors duration-150"
                  >
                    {cellVal}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </main>

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
