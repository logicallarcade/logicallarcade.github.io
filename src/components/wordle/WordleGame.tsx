'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Swal from 'sweetalert2'
import { supabase } from '@/lib/supabase'
import { generateRoomCode, getOrCreateUsername, saveUsername, escapeHTML } from '@/lib/utils'
import GameHeader from '@/components/shared/GameHeader'
import MultiplayerLobby, { PlayerInfo } from '@/components/shared/MultiplayerLobby'

const FALLBACK_WORDS = [
  "MAKAN", "MINUM", "TANAH", "RUMAH", "BUNGA", "PINTU", "HIDUP", "CINTA", "KUAT", "LEMAH",
  "PAGI", "SIANG", "MALAM", "DUNIA", "SURYA", "KAPAL", "BULAN", "AWAN", "SENJA", "HUJAN"
]

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
]

interface GuessState {
  guess: string
  grades: ('correct' | 'present' | 'absent')[]
}

interface OpponentGuess {
  guess: string
  grades: ('correct' | 'present' | 'absent')[]
}

export default function WordleGame() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // --- USER STATE ---
  const [username, setUsername] = useState('')
  const myClientId = useRef(Math.random().toString(36).substring(2, 9))

  // --- GAME STATE ---
  const [secretWord, setSecretWord] = useState('')
  const [currentRow, setCurrentRow] = useState(0)
  const [currentTile, setCurrentTile] = useState(0)
  const [guesses, setGuesses] = useState<string[]>(Array(6).fill(''))
  const [grades, setGrades] = useState<('correct' | 'present' | 'absent')[][]>(Array(6).fill([]))
  const [flipRows, setFlipRows] = useState<boolean[]>(Array(6).fill(false))
  const [gameActive, setGameActive] = useState(true)
  const [isAnimating, setIsAnimating] = useState(false)
  const [keyColors, setKeyColors] = useState<Record<string, 'correct' | 'present' | 'absent'>>({})

  // --- STATS STATE ---
  const [stats, setStats] = useState({
    played: 0,
    won: 0,
    streak: 0,
    maxStreak: 0,
    distribution: [0, 0, 0, 0, 0, 0]
  })

  // --- MULTIPLAYER STATE ---
  const [isMultiplayer, setIsMultiplayer] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [opponentGuesses, setOpponentGuesses] = useState<OpponentGuess[]>([])
  const [opponentName, setOpponentName] = useState('')
  const [myFinished, setMyFinished] = useState(false)
  const [opponentFinished, setOpponentFinished] = useState(false)
  const [opponentOutcome, setOpponentOutcome] = useState<'win' | 'lose' | ''>('')
  const [opponentFinalRow, setOpponentFinalRow] = useState(0)
  const [isSharedToLobby, setIsSharedToLobby] = useState(false)
  const [showRoomInfo, setShowRoomInfo] = useState(false)
  const [shareLink, setShareLink] = useState('')

  // --- COUNTDOWN STATE ---
  const [countdownActive, setCountdownActive] = useState(false)
  const [countdownCount, setCountdownCount] = useState(5)
  const [isStartingGame, setIsStartingGame] = useState(false)
  const [versusStarted, setVersusStarted] = useState(false)

  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lobbyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Refs for tracking state inside stale closures
  const secretWordRef = useRef('')
  const guessesRef = useRef<string[]>([])
  const currentRowRef = useRef(0)
  const statsRef = useRef<any>(null)
  const isHostRef = useRef(false)
  const opponentOutcomeRef = useRef('')
  const opponentFinalRowRef = useRef(0)
  const opponentNameRef = useRef('')

  useEffect(() => { secretWordRef.current = secretWord }, [secretWord])
  useEffect(() => { guessesRef.current = guesses }, [guesses])
  useEffect(() => { currentRowRef.current = currentRow }, [currentRow])
  useEffect(() => { statsRef.current = stats }, [stats])
  useEffect(() => { isHostRef.current = isHost }, [isHost])
  useEffect(() => { opponentOutcomeRef.current = opponentOutcome }, [opponentOutcome])
  useEffect(() => { opponentFinalRowRef.current = opponentFinalRow }, [opponentFinalRow])
  useEffect(() => { opponentNameRef.current = opponentName }, [opponentName])

  // --- TOAST STATE ---
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])
  const toastId = useRef(0)

  const showToast = useCallback((msg: string) => {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2000)
  }, [])

  // --- LOAD STATS ---
  useEffect(() => {
    const stored = localStorage.getItem('logicall_wordle_stats')
    if (stored) {
      try {
        setStats(JSON.parse(stored))
      } catch (e) {
        console.error("Error parsing stats", e)
      }
    }

    const uname = getOrCreateUsername()
    setUsername(uname)

    // Check for room in URL
    const roomParam = searchParams.get('room')
    if (roomParam) {
      setTimeout(() => {
        joinVersusRoom(roomParam.trim().toUpperCase())
      }, 300)
    } else {
      initGame(false)
    }

    return () => {
      if (roomChannelRef.current) supabase.removeChannel(roomChannelRef.current)
      if (lobbyChannelRef.current) supabase.removeChannel(lobbyChannelRef.current)
    }
  }, []) // eslint-disable-line

  // --- AUTO-TRACK LOBBY PRESENCE ---
  useEffect(() => {
    if (isMultiplayer && isHost && isSharedToLobby && lobbyChannelRef.current) {
      lobbyChannelRef.current.track({
        roomCode,
        game: 'wordle',
        hostName: username,
        playerCount: players.length,
        maxPlayers: 2,
        updatedAt: new Date().toISOString()
      })
    }
  }, [players.length, username, isMultiplayer, isHost, isSharedToLobby, roomCode])

  // --- START GAME SEQUENCE ---
  const triggerGameStartSequence = (word: string, hasCountdown = true) => {
    setGuesses(Array(6).fill(''))
    setGrades(Array(6).fill([]))
    setFlipRows(Array(6).fill(false))
    setCurrentRow(0)
    setCurrentTile(0)
    setKeyColors({})
    setOpponentGuesses([])
    setMyFinished(false)
    setOpponentFinished(false)
    setOpponentOutcome('')
    setOpponentFinalRow(0)
    setSecretWord(word)
    setVersusStarted(true)

    if (hasCountdown) {
      setGameActive(false)
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
    } else {
      setCountdownActive(false)
      setGameActive(true)
    }
  }

  // --- INIT GAME ---
  const initGame = async (multiplayerMode: boolean, customSecret?: string) => {
    setIsAnimating(true)

    if (multiplayerMode) {
      if (customSecret) {
        triggerGameStartSequence(customSecret.toUpperCase(), true)
        setIsAnimating(false)
      } else {
        setGuesses(Array(6).fill(''))
        setGrades(Array(6).fill([]))
        setFlipRows(Array(6).fill(false))
        setCurrentRow(0)
        setCurrentTile(0)
        setKeyColors({})
        setOpponentGuesses([])
        setMyFinished(false)
        setOpponentFinished(false)
        setOpponentOutcome('')
        setOpponentFinalRow(0)
        setSecretWord('')
        setGameActive(false)
        setIsAnimating(false)
      }
      return
    }

    // Fetch random word for Solo Mode
    let word = ''
    try {
      const { data, error } = await supabase.rpc('get_random_wordle_word')
      if (error) throw error
      if (!data) throw new Error("No word returned")
      word = data.toUpperCase()
    } catch (err) {
      console.error("Failed to load secret word from Supabase. Using fallback.", err)
      const randomWord = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)]
      word = randomWord
    }

    triggerGameStartSequence(word, false)
    setIsAnimating(false)
  }

  // --- GRADING ALGORITHM ---
  const gradeWord = (guess: string, secret: string) => {
    const grading: ('correct' | 'present' | 'absent')[] = Array(5).fill('absent')
    const secretLetters = secret.split('')
    const guessLetters = guess.split('')

    const letterCounts: Record<string, number> = {}
    for (const l of secretLetters) {
      letterCounts[l] = (letterCounts[l] || 0) + 1
    }

    // Pass 1: exact matches
    for (let i = 0; i < 5; i++) {
      if (guessLetters[i] === secretLetters[i]) {
        grading[i] = 'correct'
        letterCounts[guessLetters[i]]--
      }
    }

    // Pass 2: partial matches
    for (let i = 0; i < 5; i++) {
      if (grading[i] === 'correct') continue
      const char = guessLetters[i]
      if (letterCounts[char] && letterCounts[char] > 0) {
        grading[i] = 'present'
        letterCounts[char]--
      }
    }

    return grading
  }

  // --- KEY PRESS ---
  const handleKeyPress = useCallback((key: string) => {
    if (!gameActive || isAnimating) return

    if (key === 'ENTER') {
      submitGuess()
    } else if (key === 'BACKSPACE') {
      deleteLetter()
    } else if (/^[A-Z]$/.test(key)) {
      addLetter(key)
    }
  }, [gameActive, isAnimating, currentRow, currentTile, guesses, secretWord]) // eslint-disable-line

  const addLetter = (char: string) => {
    if (currentTile >= 5) return
    setGuesses(prev => {
      const next = [...prev]
      next[currentRow] = next[currentRow] + char
      return next
    })
    setCurrentTile(prev => prev + 1)
  }

  const deleteLetter = () => {
    if (currentTile <= 0) return
    setGuesses(prev => {
      const next = [...prev]
      next[currentRow] = next[currentRow].slice(0, -1)
      return next
    })
    setCurrentTile(prev => prev - 1)
  }

  const submitGuess = async () => {
    const guess = guesses[currentRow]
    if (guess.length < 5) {
      showToast("Huruf kurang!")
      shakeRow(currentRow)
      return
    }

    setIsAnimating(true)

    // Validate guess word against Supabase
    let isValid = false
    try {
      const { data, error } = await supabase
        .from('wordle_words')
        .select('word')
        .eq('word', guess)
        .maybeSingle()

      if (error) throw error
      isValid = data !== null
    } catch (err) {
      console.error("Database check failed. Falling back to simple check.", err)
      isValid = FALLBACK_WORDS.includes(guess) || guess.length === 5
    }

    if (!isValid) {
      showToast("Tidak ada dalam kamus!")
      shakeRow(currentRow)
      setIsAnimating(false)
      return
    }

    const currentGrades = gradeWord(guess, secretWord)

    // Apply color changes row-wise
    setGrades(prev => {
      const next = [...prev]
      next[currentRow] = currentGrades
      return next
    })

    // Trigger flip transition
    setFlipRows(prev => {
      const next = [...prev]
      next[currentRow] = true
      return next
    })

    // Keyboard colors
    setTimeout(() => {
      setKeyColors(prev => {
        const next = { ...prev }
        for (let i = 0; i < 5; i++) {
          const char = guess[i]
          const grade = currentGrades[i]
          if (grade === 'correct') {
            next[char] = 'correct'
          } else if (grade === 'present') {
            if (next[char] !== 'correct') {
              next[char] = 'present'
            }
          } else {
            if (next[char] !== 'correct' && next[char] !== 'present') {
              next[char] = 'absent'
            }
          }
        }
        return next
      })

      const isWin = guess === secretWord
      const isLose = !isWin && currentRow === 5

      if (isMultiplayer && roomChannelRef.current) {
        roomChannelRef.current.send({
          type: 'broadcast',
          event: 'versus-guess',
          payload: {
            clientId: myClientId.current,
            row: currentRow,
            guess: guess,
            grades: currentGrades
          }
        })

        if (isWin) {
          roomChannelRef.current.send({
            type: 'broadcast',
            event: 'versus-end',
            payload: {
              clientId: myClientId.current,
              outcome: 'win',
              row: currentRow,
              guess: guess,
              grades: currentGrades
            }
          })
        } else if (isLose) {
          roomChannelRef.current.send({
            type: 'broadcast',
            event: 'versus-end',
            payload: {
              clientId: myClientId.current,
              outcome: 'lose',
              row: currentRow,
              guess: guess,
              grades: currentGrades
            }
          })
        }
      }

      if (isWin) {
        if (isMultiplayer) {
          setMyFinished(true)
          setGameActive(false)
          setIsAnimating(false)
          endVersusMatch(true, currentRow, guess)
        } else {
          handleWin()
        }
      } else if (isLose) {
        if (isMultiplayer) {
          setMyFinished(true)
          setGameActive(false)
          setIsAnimating(false)
          if (opponentFinished) {
            endVersusMatch(false, currentRow, guess)
          } else {
            showToast("Menunggu lawan menyelesaikan...")
          }
        } else {
          handleLoss()
        }
      } else {
        setCurrentRow(prev => prev + 1)
        setCurrentTile(0)
        setIsAnimating(false)
      }
    }, 1300)
  }

  const shakeRow = (rowIdx: number) => {
    const el = document.getElementById(`wordle-row-${rowIdx}`)
    if (el) {
      el.classList.add('animate-[shake_0.4s_ease-in-out]')
      setTimeout(() => {
        el.classList.remove('animate-[shake_0.4s_ease-in-out]')
      }, 400)
    }
  }

  // --- WIN/LOSS HANDLERS ---
  const handleWin = () => {
    setGameActive(false)
    setIsAnimating(false)

    const nextStats = { ...stats }
    nextStats.played++
    nextStats.won++
    nextStats.streak++
    if (nextStats.streak > nextStats.maxStreak) {
      nextStats.maxStreak = nextStats.streak
    }
    nextStats.distribution[currentRow]++
    setStats(nextStats)
    localStorage.setItem('logicall_wordle_stats', JSON.stringify(nextStats))

    const praises = ["Luar Biasa!", "Hebat!", "Mantap!", "Bagus Sekali!", "Pintar!", "Berhasil!"]
    showToast(praises[currentRow])
    setTimeout(() => {
      showGameOverModal(true, currentRow)
    }, 1000)
  }

  const handleLoss = () => {
    setGameActive(false)
    setIsAnimating(false)

    const nextStats = { ...stats }
    nextStats.played++
    nextStats.streak = 0
    setStats(nextStats)
    localStorage.setItem('logicall_wordle_stats', JSON.stringify(nextStats))

    showToast("Kesempatan Habis!")
    setTimeout(() => {
      showGameOverModal(false, currentRow)
    }, 1000)
  }

  // --- END OF MULTIPLAYER MATCH ---
  const endVersusMatch = (iWon: boolean, myFinalRow: number, myLastGuess: string) => {
    const oppWin = opponentOutcomeRef.current === 'win'
    const oppFinalRow = opponentFinalRowRef.current
    const secWord = secretWordRef.current
    const oppName = opponentNameRef.current
    const currentStats = statsRef.current
    const hostFlag = isHostRef.current

    let titleText = "Hasil Pertandingan"
    let messageText = ""

    const actualIWon = myLastGuess === secWord

    if (actualIWon && oppWin) {
      if (myFinalRow < oppFinalRow) {
        titleText = "Anda Menang!"
        messageText = `Selamat! Anda berhasil menebak dalam ${myFinalRow + 1} baris, sedangkan lawan dalam ${oppFinalRow + 1} baris.`
      } else if (myFinalRow > oppFinalRow) {
        titleText = "Lawan Menang!"
        messageText = `${oppName || 'Lawan'} berhasil menebak dalam ${oppFinalRow + 1} baris, sedangkan Anda dalam ${myFinalRow + 1} baris.`
      } else {
        titleText = "Hasil Seri!"
        messageText = `Kedua pemain berhasil menebak kata rahasia dalam ${myFinalRow + 1} baris!`
      }
    } else if (actualIWon) {
      titleText = "Anda Menang!"
      messageText = `Selamat! Anda berhasil menebak kata rahasia [${secWord}], sedangkan lawan gagal!`
    } else if (oppWin) {
      titleText = "Lawan Menang!"
      messageText = `${oppName || 'Lawan'} berhasil menebak kata rahasia [${secWord}], sedangkan Anda gagal!`
    } else {
      titleText = "Permainan Selesai!"
      messageText = `Kedua pemain gagal menebak kata rahasia [${secWord}].`
    }

    // Save stats
    const nextStats = { ...currentStats }
    if (actualIWon) {
      nextStats.played++
      nextStats.won++
      nextStats.streak++
      if (nextStats.streak > nextStats.maxStreak) {
        nextStats.maxStreak = nextStats.streak
      }
      nextStats.distribution[myFinalRow]++
    } else {
      nextStats.played++
      nextStats.streak = 0
    }
    setStats(nextStats)
    localStorage.setItem('logicall_wordle_stats', JSON.stringify(nextStats))

    showToast(titleText)

    setTimeout(() => {
      Swal.fire({
        title: titleText,
        html: `
          <div style="font-family: var(--font-mono); font-size: 0.85rem; line-height: 1.6; color: var(--color-text);">
            <p>${messageText}</p>
            <div style="margin: 15px 0; padding: 10px; background: rgba(0,0,0,0.3); border: 1px dashed var(--color-border); border-radius: 4px;">
              Kata Rahasia: <strong style="color: var(--color-gold); font-size: 1.1rem; letter-spacing: 2px;">${secWord}</strong>
            </div>
            ${!hostFlag ? '<div style="margin-top: 15px; padding: 8px; border: 1px dashed var(--color-gold-dim); color: var(--color-gold); font-size: 0.75rem; font-weight: bold; animation: pulse 2s infinite;">Menunggu Host memulai kembali...</div>' : ''}
          </div>
        `,
        icon: actualIWon ? 'success' : 'info',
        background: 'var(--color-bg-card)',
        color: 'var(--color-text)',
        showCancelButton: true,
        showConfirmButton: hostFlag,
        confirmButtonText: 'Main Lagi',
        cancelButtonText: 'Menu Utama',
        allowOutsideClick: false,
        customClass: {
          popup: 'ornate-border classic-card',
          title: 'text-lg font-bold uppercase tracking-wider',
        }
      }).then((res) => {
        if (res.isConfirmed) {
          if (hostFlag) {
            startVersusGame()
          }
        } else if (res.dismiss === Swal.DismissReason.cancel) {
          leaveVersusRoom()
          router.push('/')
        }
      })
    }, 2500)
  }

  const showGameOverModal = (isWin: boolean, row: number) => {
    Swal.fire({
      title: isWin ? '✦ KEMENANGAN ✦' : '✦ KEKALAHAN ✦',
      html: `
        <div style="font-family: var(--font-mono); font-size: 0.8rem; text-align: center; color: var(--color-text);">
          <p>${isWin ? 'Luar biasa, Anda berhasil menebak kata rahasia!' : 'Maaf, kesempatan menebak Anda telah habis.'}</p>
          <div style="margin: 15px 0; padding: 10px; background: rgba(0,0,0,0.3); border: 1px dashed var(--color-border); border-radius: 4px;">
            Kata Rahasia: <strong style="color: var(--color-gold); font-size: 1.2rem; letter-spacing: 2px;">${secretWord}</strong>
          </div>
          <div style="display: grid; grid-template-cols: repeat(4, 1fr); gap: 10px; margin-top: 15px; border-top: 1px solid var(--color-border); padding-top: 15px;">
            <div>
              <div style="font-size: 1.2rem; font-weight: bold; color: var(--color-gold);">${stats.played + 1}</div>
              <div style="font-size: 0.65rem; color: var(--color-text-muted);">Main</div>
            </div>
            <div>
              <div style="font-size: 1.2rem; font-weight: bold; color: var(--color-gold);">${Math.round(((stats.won + (isWin ? 1 : 0)) / (stats.played + 1)) * 100)}%</div>
              <div style="font-size: 0.65rem; color: var(--color-text-muted);">Akurasi</div>
            </div>
            <div>
              <div style="font-size: 1.2rem; font-weight: bold; color: var(--color-gold);">${isWin ? stats.streak + 1 : 0}</div>
              <div style="font-size: 0.65rem; color: var(--color-text-muted);">Streak</div>
            </div>
            <div>
              <div style="font-size: 1.2rem; font-weight: bold; color: var(--color-gold);">${Math.max(stats.maxStreak, isWin ? stats.streak + 1 : 0)}</div>
              <div style="font-size: 0.65rem; color: var(--color-text-muted);">Max Streak</div>
            </div>
          </div>
        </div>
      `,
      background: 'var(--color-bg-card)',
      color: 'var(--color-text)',
      confirmButtonText: 'MAIN LAGI',
      confirmButtonColor: 'var(--color-gold)',
      customClass: {
        popup: 'ornate-border classic-card',
        title: 'text-lg font-bold tracking-widest',
      }
    }).then(() => {
      initGame(false)
    })
  }

  // --- MULTIPLAYER ROOM CONFIG & SYNC ---
  const setupSupabaseVersus = (code: string, amIHost: boolean) => {
    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current)
    }

    const uname = getOrCreateUsername()
    const ch = supabase.channel(`wordle-room-${code}`, {
      config: { presence: { key: myClientId.current } }
    })

    ch
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        const list: PlayerInfo[] = []
        let oppName = ''

        Object.values(state).forEach((arr: any) => {
          arr.forEach((p: any) => {
            list.push({
              clientId: p.clientId,
              username: p.username,
              isHost: p.role === 'host',
              isMe: p.clientId === myClientId.current
            })
            if (p.clientId !== myClientId.current) {
              oppName = p.username
            }
          })
        })

        list.sort((a, b) => (a.isHost ? -1 : 1))
        setPlayers(list)
        setOpponentName(oppName)

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

        if (list.length > 2) {
          showToast("Room penuh! Maksimal 2 pemain.")
          leaveVersusRoom()
        }
      })
      .on('broadcast', { event: 'versus-start' }, ({ payload }) => {
        const { secretWord: word } = payload
        Swal.close()
        initGame(true, word)
        showToast("Game Versus Dimulai!")
      })
      .on('broadcast', { event: 'versus-guess' }, ({ payload }) => {
        if (payload.clientId === myClientId.current) return
        setOpponentGuesses(prev => {
          const next = [...prev]
          next[payload.row] = {
            guess: payload.guess,
            grades: payload.grades
          }
          return next
        })
      })
      .on('broadcast', { event: 'versus-end' }, ({ payload }) => {
        if (payload.clientId === myClientId.current) return
        setOpponentFinished(true)
        setOpponentOutcome(payload.outcome)
        setOpponentFinalRow(payload.row)
        setOpponentGuesses(prev => {
          const next = [...prev]
          next[payload.row] = {
            guess: payload.guess,
            grades: payload.grades
          }
          return next
        })
        showToast("Lawan telah selesai!")

        if (payload.outcome === 'win') {
          setMyFinished(true)
          setGameActive(false)
          // Evaluate match outcome immediately if opponent won
          setTimeout(() => {
            const myLastGuess = guessesRef.current[currentRowRef.current]
            endVersusMatch(false, currentRowRef.current, myLastGuess)
          }, 1500)
        }
      })
      .on('broadcast', { event: 'versus-kick' }, ({ payload }) => {
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
      .on('broadcast', { event: 'versus-close' }, () => {
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
            role: amIHost ? 'host' : 'guest',
            onlineAt: new Date().toISOString()
          })
          if (!amIHost) showToast("Berhasil bergabung ke room!")
        }
      })

    roomChannelRef.current = ch
  }

  const createVersusRoom = () => {
    const code = generateRoomCode(6)
    setRoomCode(code)
    setIsMultiplayer(true)
    setIsHost(true)
    setShowRoomInfo(true)
    setShareLink(`${window.location.origin}/wordle?room=${code}`)
    setGameActive(false)
    setupSupabaseVersus(code, true)
    setVersusStarted(false)
    showToast("Room dibuat!")
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
    setShareLink(`${window.location.origin}/wordle?room=${sanitized}`)
    setGameActive(false)
    setVersusStarted(false)
    setupSupabaseVersus(sanitized, false)
  }

  const leaveVersusRoom = () => {
    if (isHost && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'versus-close',
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
    setOpponentGuesses([])
    setOpponentName('')
    setShowRoomInfo(false)
    setIsSharedToLobby(false)
    setVersusStarted(false)
    initGame(false)
    showToast("Keluar dari room")
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
          game: 'wordle',
          hostName: username,
          playerCount: players.length,
          maxPlayers: 2,
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
      event: 'versus-kick',
      payload: { targetClientId: clientId }
    })
  }

  const startVersusGame = async () => {
    if (!isHost || players.length < 2 || !roomChannelRef.current) {
      showToast("Butuh minimal 2 pemain!")
      return
    }

    setIsStartingGame(true)
    showToast("Mengambil kata rahasia...")
    let word = ""
    try {
      const { data, error } = await supabase.rpc('get_random_wordle_word')
      if (error) throw error
      word = data.toUpperCase()
    } catch (err) {
      console.error("Gagal mengambil kata dari database", err)
      word = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)]
    }

    roomChannelRef.current.send({
      type: 'broadcast',
      event: 'versus-start',
      payload: { secretWord: word }
    })

    Swal.close() // Close any open SweetAlert on host
    initGame(true, word)
    setIsStartingGame(false)
  }

  const handleUsernameChange = (val: string) => {
    setUsername(val)
    saveUsername(val)
    if (roomChannelRef.current && val.trim()) {
      roomChannelRef.current.track({
        clientId: myClientId.current,
        username: val.trim(),
        role: isHost ? 'host' : 'guest',
        onlineAt: new Date().toISOString()
      })
    }
  }

  // --- STATS / HELP TRIGGERS ---
  const toggleHelp = () => {
    Swal.fire({
      title: '✦ CARA BERMAIN ✦',
      html: `
        <div style="font-family: var(--font-mono); font-size: 0.75rem; text-align: left; line-height: 1.6; color: var(--color-text);">
          <p>Tebak kata rahasia dalam 6 kali percobaan. Setiap tebakan harus berupa kata 5 huruf Bahasa Indonesia yang valid.</p>
          <p style="margin-top: 10px;">Setelah setiap tebakan, warna ubin akan berubah untuk menunjukkan seberapa dekat tebakan Anda:</p>
          <div style="margin: 10px 0;">
            <div style="display: flex; gap: 5px; align-items: center; margin-bottom: 5px;">
              <span class="w-8 h-8 flex items-center justify-center font-bold bg-[#2e7d32] text-white rounded">M</span>
              <span>Huruf ada di dalam kata dan posisi yang <b>BENAR</b>.</span>
            </div>
            <div style="display: flex; gap: 5px; align-items: center; margin-bottom: 5px;">
              <span class="w-8 h-8 flex items-center justify-center font-bold bg-[#7a5e10] text-white rounded">A</span>
              <span>Huruf ada di dalam kata tetapi posisinya <b>SALAH</b>.</span>
            </div>
            <div style="display: flex; gap: 5px; align-items: center;">
              <span class="w-8 h-8 flex items-center justify-center font-bold bg-[#3a2e1a] text-white rounded">S</span>
              <span>Huruf <b>TIDAK ADA</b> dalam kata rahasia.</span>
            </div>
          </div>
        </div>
      `,
      background: 'var(--color-bg-card)',
      color: 'var(--color-text)',
      confirmButtonText: 'MENGERTI',
      confirmButtonColor: 'var(--color-gold)',
      customClass: {
        popup: 'ornate-border classic-card',
        title: 'text-lg font-bold tracking-widest',
      }
    })
  }

  const toggleStats = () => {
    Swal.fire({
      title: '✦ STATISTIK GAME ✦',
      html: `
        <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--color-text);">
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
            <div>
              <div style="font-size: 1.3rem; font-weight: bold; color: var(--color-gold);">${stats.played}</div>
              <div style="font-size: 0.65rem; color: var(--color-text-muted);">Main</div>
            </div>
            <div>
              <div style="font-size: 1.3rem; font-weight: bold; color: var(--color-gold);">${stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0}%</div>
              <div style="font-size: 0.65rem; color: var(--color-text-muted);">Menang</div>
            </div>
            <div>
              <div style="font-size: 1.3rem; font-weight: bold; color: var(--color-gold);">${stats.streak}</div>
              <div style="font-size: 0.65rem; color: var(--color-text-muted);">Streak</div>
            </div>
            <div>
              <div style="font-size: 1.3rem; font-weight: bold; color: var(--color-gold);">${stats.maxStreak}</div>
              <div style="font-size: 0.65rem; color: var(--color-text-muted);">Max Streak</div>
            </div>
          </div>
          <div style="text-align: left; border-top: 1px solid var(--color-border); padding-top: 15px;">
            <p style="font-size: 0.7rem; font-weight: bold; color: var(--color-text-muted); margin-bottom: 8px; text-transform: uppercase;">Distribusi Tebakan:</p>
            ${stats.distribution.map((val, idx) => {
              const maxDist = Math.max(...stats.distribution, 1)
              const width = Math.max(10, Math.round((val / maxDist) * 100))
              return `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 0.7rem;">
                  <span style="color: var(--color-text-muted);">${idx + 1}</span>
                  <div style="flex-grow: 1; height: 16px; background: rgba(0,0,0,0.3); border-radius: 2px; overflow: hidden;">
                    <div style="width: ${width}%; height: 100%; background: ${val > 0 ? 'var(--color-gold)' : 'var(--color-border)'}; display: flex; align-items: center; justify-content: flex-end; padding-right: 5px; color: #000; font-weight: bold; font-size: 0.6rem; transition: width 0.5s ease;">
                      ${val}
                    </div>
                  </div>
                </div>
              `
            }).join('')}
          </div>
        </div>
      `,
      background: 'var(--color-bg-card)',
      color: 'var(--color-text)',
      confirmButtonText: 'TUTUP',
      confirmButtonColor: 'var(--color-gold)',
      customClass: {
        popup: 'ornate-border classic-card',
        title: 'text-lg font-bold tracking-widest',
      }
    })
  }

  // Physical keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      const key = e.key.toUpperCase()
      if (key === 'ENTER') {
        handleKeyPress('ENTER')
      } else if (key === 'BACKSPACE') {
        handleKeyPress('BACKSPACE')
      } else if (/^[A-Z]$/.test(key)) {
        handleKeyPress(key)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyPress])

  // Virtual keyboard colors
  const getKeyColor = (key: string) => {
    const colorType = keyColors[key]
    if (colorType === 'correct') return '#2e7d32'
    if (colorType === 'present') return '#7a5e10'
    if (colorType === 'absent') return '#3a2e1a'
    return 'linear-gradient(180deg, #3a2a08, #1e1508)'
  }

  // --- RENDERING TILES ---
  const renderRow = (rowIdx: number, isOpponent = false) => {
    const word = isOpponent
      ? (opponentGuesses[rowIdx]?.guess || '')
      : guesses[rowIdx]

    const rowGrades = isOpponent
      ? (opponentGuesses[rowIdx]?.grades || [])
      : grades[rowIdx]

    const isFlipped = !isOpponent && flipRows[rowIdx]

    // Hide details for opponent if I haven't finished and failed
    const myWin = guesses.some((g, rIdx) => g === secretWord && grades[rIdx].every(gr => gr === 'correct'))
    const showOpponentDetails = myFinished && (!myWin || opponentFinished)

    return (
      <div
        id={isOpponent ? `wordle-opp-row-${rowIdx}` : `wordle-row-${rowIdx}`}
        key={rowIdx}
        className="flex justify-center gap-1.5"
      >
        {Array.from({ length: 5 }).map((_, tileIdx) => {
          const char = word[tileIdx] || ''
          const grade = rowGrades[tileIdx]

          let bg = 'rgba(10, 8, 4, 0.6)'
          let border = '1px solid var(--color-border)'
          let color = 'var(--color-ivory)'
          let transformClass = ''

          if (char) {
            bg = 'rgba(201, 162, 39, 0.08)'
            border = '2px solid var(--color-gold-dim)'
          }

          if (grade) {
            if (isOpponent && !showOpponentDetails) {
              // Neutral placeholder
              bg = 'var(--color-border-glow)'
              border = '1px solid var(--color-gold-dim)'
            } else {
              if (grade === 'correct') {
                bg = '#2e7d32'
                border = '1px solid #1b5e20'
              } else if (grade === 'present') {
                bg = '#7a5e10'
                border = '1px solid #5d4037'
              } else {
                bg = '#3a2e1a'
                border = '1px solid #2d2212'
              }
            }
          }

          if (isFlipped) {
            // Apply delay based on tile index
            transformClass = `animate-[flip_0.6s_ease_forwards]`
          }

          return (
            <div
              key={tileIdx}
              className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-sm sm:text-base font-extrabold uppercase rounded font-mono select-none transition-all duration-300 ${transformClass}`}
              style={{
                background: bg,
                border,
                color,
                animationDelay: `${tileIdx * 200}ms`
              }}
            >
              {isOpponent && !showOpponentDetails && char ? '✦' : char}
            </div>
          )
        })}
      </div>
    )
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
        title="Wordle"
        subtitle="Tebak kata rahasia 5 huruf Bahasa Indonesia"
        connectionStatus={isMultiplayer ? (isHost ? `Host: ${roomCode}` : `Tamu: ${roomCode}`) : 'Mode Solo'}
        connectionDot={isMultiplayer ? (isHost ? 'host' : 'guest') : 'solo'}
        playerRoleBadge={isMultiplayer ? (isHost ? 'HOST' : 'TAMU') : null}
        onBack={() => {
          leaveVersusRoom()
          router.push('/')
        }}
        onRestart={() => {
          if (!isMultiplayer) initGame(false)
          else if (isHost) startVersusGame()
          else showToast("Hanya Host yang bisa restart!")
        }}
        onStats={toggleStats}
        onHelp={toggleHelp}
        username={username}
        onUsernameChange={handleUsernameChange}
      />

      {/* Lobby Panel */}
      <MultiplayerLobby
        gameKey="Wordle"
        isMultiplayer={isMultiplayer}
        isHost={isHost}
        roomCode={roomCode}
        maxPlayers={2}
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
        startBtnDisabled={players.length < 2 || isAnimating || isStartingGame || gameActive || countdownActive}
        canStart={players.length >= 2}
        showRoomInfo={showRoomInfo}
        shareLink={shareLink}
        onCopyRoomCode={copyRoomCode}
        onCopyRoomLink={copyRoomCode}
      />

      {/* Main Boards Area */}
      <main className="flex-grow flex flex-col items-center justify-center p-4 max-w-4xl mx-auto w-full gap-6">
        <div className={`w-full flex flex-col md:flex-row gap-6 md:gap-12 items-center justify-center`}>
          {/* Own board */}
          <div className="flex flex-col gap-2">
            <span
              className="text-[10px] font-bold uppercase tracking-wider text-center"
              style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
            >
              Papan Anda
            </span>
            <div
              id="wordle-board"
              className="flex flex-col gap-2 p-3 rounded classic-card"
            >
              {Array.from({ length: 6 }).map((_, idx) => renderRow(idx, false))}
            </div>
          </div>

          {/* Opponent board (visible in multiplayer) */}
          {isMultiplayer && (
            <div className="flex flex-col gap-2">
              <span
                className="text-[10px] font-bold uppercase tracking-wider text-center"
                style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
              >
                Papan Lawan ({opponentName || 'Lawan'})
              </span>
              <div
                id="wordle-board-opponent"
                className="relative flex flex-col gap-2 p-3 rounded classic-card overflow-hidden"
              >
                {/* Opponent board mask */}
                {!myFinished && !opponentFinished && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 z-10"
                    style={{ background: 'rgba(18, 13, 7, 0.95)' }}
                  >
                    <i className="fa-solid fa-eye-slash text-lg mb-2" style={{ color: 'var(--color-gold-dim)' }} />
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest leading-relaxed"
                      style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
                    >
                      Disembunyikan<br />
                      Selesaikan tebakan Anda dahulu!
                    </span>
                  </div>
                )}
                {Array.from({ length: 6 }).map((_, idx) => renderRow(idx, true))}
              </div>
            </div>
          )}
        </div>

        {/* Keyboard Input Area */}
        <div className="w-full max-w-lg flex flex-col gap-1.5 mt-2">
          {KEYBOARD_ROWS.map((row, rowIdx) => (
            <div key={rowIdx} className="flex justify-center gap-1 w-full">
              {row.map(key => {
                const isSpecial = key === 'ENTER' || key === 'BACKSPACE'
                const btnBg = getKeyColor(key)
                return (
                  <button
                    key={key}
                    onClick={() => handleKeyPress(key)}
                    style={{
                      background: btnBg,
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-gold-light)'
                    }}
                    className={`flex-grow h-10 rounded font-mono text-[10px] sm:text-xs font-bold flex items-center justify-center cursor-pointer transition-all active:scale-95 uppercase ${
                      isSpecial ? 'px-2 min-w-[50px]' : 'w-7'
                    }`}
                  >
                    {key === 'BACKSPACE' ? <i className="fa-solid fa-delete-left text-sm" /> : key}
                  </button>
                )
              })}
            </div>
          ))}
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
