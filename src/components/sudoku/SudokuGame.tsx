'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Swal from 'sweetalert2'
import { supabase } from '@/lib/supabase'
import { generateRoomCode, getOrCreateUsername, saveUsername, escapeHTML } from '@/lib/utils'
import GameHeader from '@/components/shared/GameHeader'
import MultiplayerLobby, { PlayerInfo } from '@/components/shared/MultiplayerLobby'

// --- SUDOKU GENERATION HELPERS ---
function isValidPlacement(board: number[][], row: number, col: number, num: number) {
  for (let i = 0; i < 9; i++) {
    if (board[row][i] === num && i !== col) return false
    if (board[i][col] === num && i !== row) return false
  }

  const boxRowStart = Math.floor(row / 3) * 3
  const boxColStart = Math.floor(col / 3) * 3
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const curRow = boxRowStart + r
      const curCol = boxColStart + c
      if (board[curRow][curCol] === num && (curRow !== row || curCol !== col)) {
        return false
      }
    }
  }
  return true
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function fillGridRandomly(board: number[][]): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) {
        const numbers = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9])
        for (const num of numbers) {
          if (isValidPlacement(board, r, c, num)) {
            board[r][c] = num
            if (fillGridRandomly(board)) {
              return true
            }
            board[r][c] = 0
          }
        }
        return false
      }
    }
  }
  return true
}

function countGridSolutions(board: number[][], limit = 2): number {
  let count = 0
  function solve() {
    if (count >= limit) return
    let row = -1
    let col = -1
    let isEmpty = false
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          row = r
          col = c
          isEmpty = true
          break
        }
      }
      if (isEmpty) break
    }
    if (!isEmpty) {
      count++
      return
    }
    for (let val = 1; val <= 9; val++) {
      if (isValidPlacement(board, row, col, val)) {
        board[row][col] = val
        solve()
        board[row][col] = 0
      }
    }
  }
  solve()
  return count
}

function generateSudokuBoard(difficulty: string): { puzzle: number[][], solution: number[][] } {
  const board = Array(9).fill(null).map(() => Array(9).fill(0))
  for (let i = 0; i < 9; i += 3) {
    const nums = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9])
    let idx = 0
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        board[i + r][i + c] = nums[idx++]
      }
    }
  }
  fillGridRandomly(board)
  const solution = board.map(row => [...row])
  const puzzle = board.map(row => [...row])

  let targetBlanks = 36
  if (difficulty === 'medium') targetBlanks = 46
  if (difficulty === 'hard') targetBlanks = 54
  if (difficulty === 'expert') targetBlanks = 60

  const cells: { r: number; c: number }[] = []
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      cells.push({ r, c })
    }
  }
  const shuffledCells = shuffleArray(cells)

  let blanks = 0
  for (let i = 0; i < 81; i++) {
    if (blanks >= targetBlanks) break
    const { r, c } = shuffledCells[i]
    const backupValue = puzzle[r][c]
    puzzle[r][c] = 0
    const tempGrid = puzzle.map(row => [...row])
    if (countGridSolutions(tempGrid, 2) === 1) {
      blanks++
    } else {
      puzzle[r][c] = backupValue
    }
  }

  return { puzzle, solution }
}

function getBoardConflicts(board: number[][]) {
  const conflicts = Array(9).fill(null).map(() => Array(9).fill(false))
  // Row check
  for (let r = 0; r < 9; r++) {
    const seen: Record<number, number> = {}
    for (let c = 0; c < 9; c++) {
      const val = board[r][c]
      if (val !== 0) {
        if (seen[val] !== undefined) {
          conflicts[r][c] = true
          conflicts[r][seen[val]] = true
        } else {
          seen[val] = c
        }
      }
    }
  }
  // Column check
  for (let c = 0; c < 9; c++) {
    const seen: Record<number, number> = {}
    for (let r = 0; r < 9; r++) {
      const val = board[r][c]
      if (val !== 0) {
        if (seen[val] !== undefined) {
          conflicts[r][c] = true
          conflicts[seen[val]][c] = true
        } else {
          seen[val] = r
        }
      }
    }
  }
  // Box check
  for (let box = 0; box < 9; box++) {
    const seen: Record<number, number> = {}
    const startRow = Math.floor(box / 3) * 3
    const startCol = (box % 3) * 3
    for (let i = 0; i < 9; i++) {
      const r = startRow + Math.floor(i / 3)
      const c = startCol + (i % 3)
      const val = board[r][c]
      if (val !== 0) {
        if (seen[val] !== undefined) {
          conflicts[r][c] = true
          const prevIdx = seen[val]
          const prevRow = startRow + Math.floor(prevIdx / 3)
          const prevCol = startCol + (prevIdx % 3)
          conflicts[prevRow][prevCol] = true
        } else {
          seen[val] = i
        }
      }
    }
  }
  return conflicts
}

// --- TYPES ---
interface RemoteSelection {
  r: number
  c: number
  username: string
}

export default function SudokuGame() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // --- USER STATE ---
  const [username, setUsername] = useState('')
  const myClientId = useRef(Math.random().toString(36).substring(2, 9))

  // --- GAME STATE ---
  const [gridValues, setGridValues] = useState<number[][]>(Array(9).fill(null).map(() => Array(9).fill(0)))
  const [initialValues, setInitialValues] = useState<number[][]>(Array(9).fill(null).map(() => Array(9).fill(0)))
  const [solutionValues, setSolutionValues] = useState<number[][]>(Array(9).fill(null).map(() => Array(9).fill(0)))
  const [hintBoard, setHintBoard] = useState<boolean[][]>(Array(9).fill(null).map(() => Array(9).fill(false)))
  const [pencilNotes, setPencilNotes] = useState<number[][][]>(Array(9).fill(null).map(() => Array(9).fill(null).map(() => [])))
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>({ r: 4, c: 4 })
  const [notesModeActive, setNotesModeActive] = useState(false)
  const [difficulty, setDifficulty] = useState('medium')
  const [isGameActive, setIsGameActive] = useState(false)
  const [hintsRemaining, setHintsRemaining] = useState(6)
  const [maxHints, setMaxHints] = useState(6)
  const [mistakesCount, setMistakesCount] = useState(0)

  // --- COUNTDOWN STATE ---
  const [countdownActive, setCountdownActive] = useState(false)
  const [countdownCount, setCountdownCount] = useState(5)
  const [isStartingGame, setIsStartingGame] = useState(false)

  // --- TIMER STATE ---
  const [secondsElapsed, setSecondsElapsed] = useState(0)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // --- MULTIPLAYER STATE ---
  const [isMultiplayer, setIsMultiplayer] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(5)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [isSharedToLobby, setIsSharedToLobby] = useState(false)
  const [showRoomInfo, setShowRoomInfo] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [remoteSelections, setRemoteSelections] = useState<Record<string, RemoteSelection>>({})
  const [versusStarted, setVersusStarted] = useState(false)

  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lobbyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Ref to synchronize solution values and prevent stale closures
  const solutionValuesRef = useRef<number[][]>(Array(9).fill(null).map(() => Array(9).fill(0)))
  useEffect(() => {
    solutionValuesRef.current = solutionValues
  }, [solutionValues])

  // --- TOAST STATE ---
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])
  const toastId = useRef(0)

  const showToast = useCallback((msg: string) => {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2000)
  }, [])

  // --- INIT & AUTO-TRACK LOBBY PRESENCE ---
  useEffect(() => {
    const uname = getOrCreateUsername()
    setUsername(uname)

    const roomParam = searchParams.get('room')
    if (roomParam) {
      setTimeout(() => {
        joinVersusRoom(roomParam.trim().toUpperCase())
      }, 300)
    } else {
      initNewGame('medium', false)
    }

    return () => {
      clearIntervals()
      if (roomChannelRef.current) supabase.removeChannel(roomChannelRef.current)
      if (lobbyChannelRef.current) supabase.removeChannel(lobbyChannelRef.current)
    }
  }, []) // eslint-disable-line

  useEffect(() => {
    if (isMultiplayer && isHost && isSharedToLobby && lobbyChannelRef.current) {
      lobbyChannelRef.current.track({
        roomCode,
        game: 'sudoku',
        hostName: username,
        playerCount: players.length,
        maxPlayers,
        updatedAt: new Date().toISOString()
      })
    }
  }, [players.length, maxPlayers, username, isMultiplayer, isHost, isSharedToLobby, roomCode])

  const clearIntervals = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }

  // --- TIMER FUNCTIONS ---
  const startTimer = () => {
    clearIntervals()
    timerIntervalRef.current = setInterval(() => {
      setSecondsElapsed(prev => {
        const next = prev + 1
        // Auto save only in solo mode
        saveGameProgress(gridValues, initialValues, solutionValues, hintBoard, pencilNotes, difficulty, next, hintsRemaining, mistakesCount)
        return next
      })
    }, 1000)
  }

  const pauseTimer = () => {
    clearIntervals()
  }

  // --- SUDOKU INTERACTION CONTROLS ---
  const selectCell = (r: number, c: number) => {
    setSelectedCell({ r, c })
    if (isMultiplayer && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'game-event',
        payload: { type: 'select', r, c, clientId: myClientId.current, username }
      })
    }
  }

  const inputNumber = (num: number) => {
    if (!isGameActive || !selectedCell) return
    const { r, c } = selectedCell

    if (initialValues[r][c] !== 0 || hintBoard[r][c]) return

    if (notesModeActive) {
      if (gridValues[r][c] === 0) {
        const notes = pencilNotes[r][c]
        const nextNotes = notes.includes(num)
          ? notes.filter(n => n !== num)
          : [...notes, num].sort()

        setPencilNotes(prev => {
          const next = [...prev]
          next[r] = [...next[r]]
          next[r][c] = nextNotes
          saveGameProgress(gridValues, initialValues, solutionValues, hintBoard, next, difficulty, secondsElapsed, hintsRemaining, mistakesCount)
          return next
        })

        if (isMultiplayer && roomChannelRef.current) {
          roomChannelRef.current.send({
            type: 'broadcast',
            event: 'game-event',
            payload: { type: 'edit', r, c, isNote: true, notes: nextNotes }
          })
        }
      }
    } else {
      let nextGrid = gridValues.map(row => [...row])
      let nextNotes = pencilNotes.map(row => row.map(cell => [...cell]))

      if (gridValues[r][c] === num) {
        nextGrid[r][c] = 0
      } else {
        nextGrid[r][c] = num
        nextNotes[r][c] = []

        // Clean intersecting notes
        cleanIntersectingNotesLocal(nextNotes, r, c, num)

        // Check mistakes
        if (num !== solutionValues[r][c]) {
          const nextMistakes = mistakesCount + 1
          setMistakesCount(nextMistakes)
          if (nextMistakes >= 3) {
            handleGameOver()
            return
          }
        }
      }

      setGridValues(nextGrid)
      setPencilNotes(nextNotes)
      saveGameProgress(nextGrid, initialValues, solutionValues, hintBoard, nextNotes, difficulty, secondsElapsed, hintsRemaining, mistakesCount)

      if (isMultiplayer && roomChannelRef.current) {
        roomChannelRef.current.send({
          type: 'broadcast',
          event: 'game-event',
          payload: { type: 'edit', r, c, val: nextGrid[r][c], isNote: false, clearNotes: true }
        })
      }

      if (checkWinConditionLocal(nextGrid)) {
        handleWin()
      }
    }
  }

  const cleanIntersectingNotesLocal = (notesMatrix: number[][][], row: number, col: number, val: number) => {
    for (let i = 0; i < 9; i++) {
      notesMatrix[row][i] = notesMatrix[row][i].filter(n => n !== val)
      notesMatrix[i][col] = notesMatrix[i][col].filter(n => n !== val)
    }
    const startRow = Math.floor(row / 3) * 3
    const startCol = Math.floor(col / 3) * 3
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        notesMatrix[startRow + r][startCol + c] = notesMatrix[startRow + r][startCol + c].filter(n => n !== val)
      }
    }
  }

  const eraseSelectedCell = () => {
    if (!isGameActive || !selectedCell) return
    const { r, c } = selectedCell
    if (initialValues[r][c] !== 0 || hintBoard[r][c]) return

    let nextGrid = gridValues.map(row => [...row])
    let nextNotes = pencilNotes.map(row => row.map(cell => [...cell]))
    let nextHints = hintBoard.map(row => [...row])

    nextGrid[r][c] = 0
    nextNotes[r][c] = []
    nextHints[r][c] = false

    setGridValues(nextGrid)
    setPencilNotes(nextNotes)
    setHintBoard(nextHints)

    saveGameProgress(nextGrid, initialValues, solutionValues, nextHints, nextNotes, difficulty, secondsElapsed, hintsRemaining, mistakesCount)

    if (isMultiplayer && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'game-event',
        payload: { type: 'edit', r, c, val: 0, isNote: false, clearNotes: true }
      })
    }
  }

  const handleHint = () => {
    if (!isGameActive || hintsRemaining <= 0) return

    const emptyCandidates: { r: number; c: number }[] = []
    const incorrectCandidates: { r: number; c: number }[] = []

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (gridValues[r][c] === 0) {
          emptyCandidates.push({ r, c })
        } else if (gridValues[r][c] !== solutionValues[r][c] && initialValues[r][c] === 0) {
          incorrectCandidates.push({ r, c })
        }
      }
    }

    let targetCell = null
    if (emptyCandidates.length > 0) {
      targetCell = emptyCandidates[Math.floor(Math.random() * emptyCandidates.length)]
    } else if (incorrectCandidates.length > 0) {
      targetCell = incorrectCandidates[Math.floor(Math.random() * incorrectCandidates.length)]
    }

    if (!targetCell) return

    const { r, c } = targetCell
    const correctVal = solutionValues[r][c]
    const nextHintsRemaining = hintsRemaining - 1
    setHintsRemaining(nextHintsRemaining)

    let nextGrid = gridValues.map(row => [...row])
    let nextNotes = pencilNotes.map(row => row.map(cell => [...cell]))
    let nextHints = hintBoard.map(row => [...row])

    nextGrid[r][c] = correctVal
    nextHints[r][c] = true
    nextNotes[r][c] = []
    cleanIntersectingNotesLocal(nextNotes, r, c, correctVal)

    setGridValues(nextGrid)
    setHintBoard(nextHints)
    setPencilNotes(nextNotes)

    saveGameProgress(nextGrid, initialValues, solutionValues, nextHints, nextNotes, difficulty, secondsElapsed, nextHintsRemaining, mistakesCount)

    if (isMultiplayer && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'game-event',
        payload: { type: 'edit', r, c, val: correctVal, isNote: false, isHint: true, clearNotes: true }
      })
    }

    if (checkWinConditionLocal(nextGrid)) {
      handleWin()
    }
  }

  // --- GAME WIN/LOSS ---
  const checkWinConditionLocal = (board: number[][]) => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) return false
      }
    }
    const conflicts = getBoardConflicts(board)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (conflicts[r][c]) return false
      }
    }
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== solutionValues[r][c]) return false
      }
    }
    return true
  }

  const handleWin = () => {
    pauseTimer()
    setIsGameActive(false)
    clearGameProgress()

    const bestKey = `logicall_sudoku_best_${difficulty}`
    const bestRecord = localStorage.getItem(bestKey)
    let isNewRecord = false
    if (!bestRecord || secondsElapsed < parseInt(bestRecord)) {
      localStorage.setItem(bestKey, secondsElapsed.toString())
      isNewRecord = true
    }

    Swal.fire({
      title: '✦ KEMENANGAN ✦',
      html: `
        <div style="font-family: var(--font-mono); font-size: 0.8rem; text-align: center; color: var(--color-text);">
          <p>Luar biasa! Anda berhasil menyelesaikan papan Sudoku.</p>
          <div style="margin: 15px 0; padding: 10px; background: rgba(0,0,0,0.3); border: 1px dashed var(--color-border); border-radius: 4px;">
            Waktu: <strong style="color: var(--color-gold); font-size: 1.2rem;">${formatTime(secondsElapsed)}</strong>
            ${isNewRecord ? '<br/><span style="color:#4ade80; font-size:0.7rem; font-weight:bold;">REKOR BARU!</span>' : ''}
          </div>
          <p style="font-size:0.7rem; color: var(--color-text-muted);">Tingkat Kesulitan: ${difficulty.toUpperCase()}</p>
          ${isMultiplayer && !isHost ? '<div style="margin-top: 15px; padding: 8px; border: 1px dashed var(--color-gold-dim); color: var(--color-gold); font-size: 0.75rem; font-weight: bold; animation: pulse 2s infinite;">Menunggu Host memulai kembali...</div>' : ''}
        </div>
      `,
      background: 'var(--color-bg-card)',
      color: 'var(--color-text)',
      showCancelButton: true,
      showConfirmButton: !isMultiplayer || isHost,
      confirmButtonText: 'Main Lagi',
      cancelButtonText: 'Menu Utama',
      allowOutsideClick: false,
      customClass: {
        popup: 'ornate-border classic-card',
        title: 'text-lg font-bold tracking-widest',
      }
    }).then((res) => {
      if (res.isConfirmed) {
        if (isMultiplayer) {
          if (isHost) startVersusGame()
        } else {
          initNewGame(difficulty, false)
        }
      } else if (res.dismiss === Swal.DismissReason.cancel) {
        leaveVersusRoom()
        router.push('/')
      }
    })

    if (isMultiplayer && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'game-event',
        payload: { type: 'win', secondsElapsed }
      })
    }
  }

  const handleGameOver = () => {
    pauseTimer()
    setIsGameActive(false)
    clearGameProgress()

    Swal.fire({
      title: '✦ GAME OVER ✦',
      html: `
        <div style="font-family: var(--font-mono); font-size: 0.8rem; text-align: center; color: var(--color-text);">
          <p>Anda melakukan 3 kesalahan. Papan gagal diselesaikan.</p>
          ${isMultiplayer && !isHost ? '<div style="margin-top: 15px; padding: 8px; border: 1px dashed var(--color-gold-dim); color: var(--color-gold); font-size: 0.75rem; font-weight: bold; animation: pulse 2s infinite;">Menunggu Host memulai kembali...</div>' : ''}
        </div>
      `,
      background: 'var(--color-bg-card)',
      color: 'var(--color-text)',
      showCancelButton: true,
      showConfirmButton: !isMultiplayer || isHost,
      confirmButtonText: 'Main Lagi',
      cancelButtonText: 'Menu Utama',
      allowOutsideClick: false,
      customClass: {
        popup: 'ornate-border classic-card',
        title: 'text-lg font-bold tracking-widest text-rose-500',
      }
    }).then((res) => {
      if (res.isConfirmed) {
        if (isMultiplayer) {
          if (isHost) startVersusGame()
        } else {
          initNewGame(difficulty, false)
        }
      } else if (res.dismiss === Swal.DismissReason.cancel) {
        leaveVersusRoom()
        router.push('/')
      }
    })

    if (isMultiplayer && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'game-event',
        payload: { type: 'game-over' }
      })
    }
  }

  // --- START GAME SEQUENCE ---
  const triggerGameStartSequence = (puzzle: number[][], solution: number[][], diff: string, hints: number, hasCountdown = true) => {
    clearIntervals()
    setGridValues(puzzle.map(row => [...row]))
    setInitialValues(puzzle.map(row => [...row]))
    setSolutionValues(solution.map(row => [...row]))
    setDifficulty(diff)
    setMistakesCount(0)
    setHintsRemaining(hints)
    setMaxHints(hints)
    setSecondsElapsed(0)
    setHintBoard(Array(9).fill(null).map(() => Array(9).fill(false)))
    setPencilNotes(Array(9).fill(null).map(() => Array(9).fill(null).map(() => [])))
    setSelectedCell({ r: 4, c: 4 })
    setVersusStarted(true)

    if (hasCountdown) {
      setIsGameActive(false)
      setCountdownCount(5)
      setCountdownActive(true)

      const interval = setInterval(() => {
        setCountdownCount(prev => {
          if (prev <= 1) {
            clearInterval(interval)
            setCountdownActive(false)
            setIsGameActive(true)
            startTimer()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      setCountdownActive(false)
      setIsGameActive(true)
      startTimer()
    }
  }

  // --- NEW GAME GENERATION ---
  const initNewGame = (diff = 'medium', isMultiplayerGame = false) => {
    clearIntervals()
    setDifficulty(diff)
    setMistakesCount(0)

    let hints = 6
    if (diff === 'easy') hints = 8
    else if (diff === 'medium') hints = 6
    else if (diff === 'hard') hints = 4
    else hints = 3

    setHintsRemaining(hints)
    setMaxHints(hints)
    setSecondsElapsed(0)
    setHintBoard(Array(9).fill(null).map(() => Array(9).fill(false)))
    setPencilNotes(Array(9).fill(null).map(() => Array(9).fill(null).map(() => [])))

    if (isMultiplayerGame) {
      setIsGameActive(false)
      return
    }

    const { puzzle, solution } = generateSudokuBoard(diff)
    triggerGameStartSequence(puzzle, solution, diff, hints, false)
  }

  // --- HANDLE DIFFICULTY CHANGE ---
  const handleDifficultyChange = (val: string) => {
    setDifficulty(val)
    if (isMultiplayer) {
      if (isHost) {
        const { puzzle, solution } = generateSudokuBoard(val)
        let hints = 6
        if (val === 'easy') hints = 8
        else if (val === 'medium') hints = 6
        else if (val === 'hard') hints = 4
        else hints = 3

        if (roomChannelRef.current) {
          roomChannelRef.current.send({
            type: 'broadcast',
            event: 'game-event',
            payload: {
              type: 'new-game',
              gridValues: puzzle,
              initialValues: puzzle,
              solutionValues: solution,
              gameDifficulty: val,
              hintsRemaining: hints
            }
          })
        }
        triggerGameStartSequence(puzzle, solution, val, hints)
      }
    } else {
      initNewGame(val, false)
    }
  }

  const resetBoard = () => {
    if (!isGameActive) return
    const nextGrid = initialValues.map(row => [...row])
    const nextNotes = Array(9).fill(null).map(() => Array(9).fill(null).map(() => [] as number[]))
    const nextHints = Array(9).fill(null).map(() => Array(9).fill(false))

    setGridValues(nextGrid)
    setPencilNotes(nextNotes)
    setHintBoard(nextHints)
    setMistakesCount(0)
    setHintsRemaining(maxHints)

    saveGameProgress(nextGrid, initialValues, solutionValues, nextHints, nextNotes, difficulty, secondsElapsed, maxHints, 0)

    if (isMultiplayer && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'game-event',
        payload: {
          type: 'undo-redo',
          grid: nextGrid,
          notes: nextNotes,
          hints: nextHints,
          hintsRemaining: maxHints,
          mistakesCount: 0
        }
      })
    }
  }

  // --- STATE SAVING/LOADING ---
  const saveGameProgress = (
    grid: number[][],
    init: number[][],
    sol: number[][],
    hints: boolean[][],
    notes: number[][][],
    diff: string,
    time: number,
    hintsLeft: number,
    mistakes: number
  ) => {
    // No-op to avoid state restoration bugs
  }

  const clearGameProgress = () => {
    // No-op
  }

  const loadSavedGame = () => {
    // No-op
  }

  // --- MULTIPLAYER ROOM SETUP & SYNC ---
  const setupSupabaseVersus = (code: string, amIHost: boolean) => {
    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current)
    }

    const uname = getOrCreateUsername()
    const ch = supabase.channel(`sudoku-room-${code}`, {
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
              isHost: p.role === 'host',
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
        setRemoteSelections(prev => {
          const next = { ...prev }
          Object.keys(next).forEach(cid => {
            if (!activeClientIds.has(cid)) delete next[cid]
          })
          return next
        })

        if (list.length > maxPlayers) {
          showToast("Room penuh!")
          leaveVersusRoom()
        }
      })
      .on('broadcast', { event: 'game-event' }, ({ payload }) => {
        handleMultiplayerEvent(payload)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({
            clientId: myClientId.current,
            username: uname,
            role: amIHost ? 'host' : 'guest',
            onlineAt: new Date().toISOString()
          })
        }
      })

    roomChannelRef.current = ch
  }

  const handleMultiplayerEvent = (payload: any) => {
    if (payload.clientId === myClientId.current) return

    switch (payload.type) {
      case 'init':
        Swal.close()
        triggerGameStartSequence(payload.gridValues, payload.solutionValues, payload.gameDifficulty, payload.hintsRemaining)
        break

      case 'edit':
        const { r, c } = payload
        if (payload.isNote) {
          setPencilNotes(prev => {
            const next = [...prev]
            next[r] = [...next[r]]
            next[r][c] = payload.notes
            return next
          })
        } else {
          setGridValues(prev => {
            const next = [...prev]
            next[r] = [...next[r]]
            next[r][c] = payload.val
            return next
          })
          if (payload.clearNotes) {
            setPencilNotes(prev => {
              const next = [...prev]
              next[r] = [...next[r]]
              next[r][c] = []
              return next
            })
          }
          if (payload.isHint) {
            setHintBoard(prev => {
              const next = [...prev]
              next[r] = [...next[r]]
              next[r][c] = true
              return next
            })
            setHintsRemaining(prev => prev - 1)
          }

          if (payload.val !== 0) {
            setPencilNotes(prev => {
              const next = prev.map(row => row.map(cell => [...cell]))
              cleanIntersectingNotesLocal(next, r, c, payload.val)
              return next
            })

            // Mistake validation on guest
            if (payload.val !== solutionValuesRef.current[r][c] && !payload.isHint) {
              setMistakesCount(prev => {
                const next = prev + 1
                if (next >= 3) {
                  handleGameOver()
                }
                return next
              })
            }
          }
        }
        break

      case 'select':
        setRemoteSelections(prev => ({
          ...prev,
          [payload.clientId]: { r: payload.r, c: payload.c, username: payload.username }
        }))
        break

      case 'timer':
        setSecondsElapsed(payload.secondsElapsed)
        break

      case 'new-game':
        Swal.close()
        triggerGameStartSequence(payload.gridValues, payload.solutionValues, payload.gameDifficulty, payload.hintsRemaining)
        break

      case 'undo-redo':
        setGridValues(payload.grid)
        setPencilNotes(payload.notes)
        setHintBoard(payload.hints)
        setHintsRemaining(payload.hintsRemaining)
        setMistakesCount(payload.mistakesCount)
        break

      case 'close-room':
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
        break

      case 'request-new-game':
        if (isHost) {
          startVersusGame()
        }
        break

      case 'win':
        setSecondsElapsed(payload.secondsElapsed)
        handleWin()
        break

      case 'game-over':
        handleGameOver()
        break

      case 'kick':
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
        break
    }
  }

  const createVersusRoom = (capacity: number) => {
    const code = generateRoomCode(6)
    setRoomCode(code)
    setMaxPlayers(capacity)
    setIsMultiplayer(true)
    setIsHost(true)
    setShowRoomInfo(true)
    setShareLink(`${window.location.origin}/sudoku?room=${code}`)
    setupSupabaseVersus(code, true)
    setVersusStarted(false)
    initNewGame(difficulty, true)
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
    setShareLink(`${window.location.origin}/sudoku?room=${sanitized}`)
    setIsGameActive(false)
    setVersusStarted(false)
    setupSupabaseVersus(sanitized, false)
  }

  const leaveVersusRoom = () => {
    if (isHost && roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'game-event',
        payload: { type: 'close-room' }
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
    setRemoteSelections({})
    setShowRoomInfo(false)
    setIsSharedToLobby(false)
    setVersusStarted(false)
    initNewGame('medium', false)
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
          game: 'sudoku',
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

  const startVersusGame = async () => {
    if (!isHost || !roomChannelRef.current) return

    setIsStartingGame(true)
    const { puzzle, solution } = generateSudokuBoard(difficulty)

    let hints = 6
    if (difficulty === 'easy') hints = 8
    else if (difficulty === 'medium') hints = 6
    else if (difficulty === 'hard') hints = 4
    else hints = 3

    roomChannelRef.current.send({
      type: 'broadcast',
      event: 'game-event',
      payload: {
        type: 'new-game',
        gridValues: puzzle,
        initialValues: puzzle,
        solutionValues: solution,
        gameDifficulty: difficulty,
        hintsRemaining: hints
      }
    })

    Swal.close() // Close any active popups
    triggerGameStartSequence(puzzle, solution, difficulty, hints)
    setIsStartingGame(false)
  }

  const kickPlayer = (clientId: string) => {
    if (!roomChannelRef.current) return
    roomChannelRef.current.send({
      type: 'broadcast',
      event: 'game-event',
      payload: { type: 'kick', targetClientId: clientId }
    })
  }

  // Authoritative host clock syncing
  useEffect(() => {
    if (isMultiplayer && isHost && roomChannelRef.current) {
      const interval = setInterval(() => {
        roomChannelRef.current?.send({
          type: 'broadcast',
          event: 'game-event',
          payload: { type: 'timer', secondsElapsed }
        })
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [isMultiplayer, isHost, secondsElapsed])

  // Guest host initialization request
  useEffect(() => {
    if (isMultiplayer && !isHost && players.length > 0) {
      const host = players.find(p => p.isHost)
      if (host && Object.keys(gridValues).length === 0) {
        // Request init state
      }
    }
  }, [isMultiplayer, isHost, players]) // eslint-disable-line

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

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      if (!selectedCell || !isGameActive) return

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault()
      }

      if (e.key >= '1' && e.key <= '9') {
        inputNumber(parseInt(e.key))
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        eraseSelectedCell()
      } else if (e.key.toLowerCase() === 'n') {
        setNotesModeActive(prev => !prev)
      } else {
        let { r, c } = selectedCell
        if (e.key === 'ArrowUp') {
          r = Math.max(0, r - 1)
          selectCell(r, c)
        } else if (e.key === 'ArrowDown') {
          r = Math.min(8, r + 1)
          selectCell(r, c)
        } else if (e.key === 'ArrowLeft') {
          c = Math.max(0, c - 1)
          selectCell(r, c)
        } else if (e.key === 'ArrowRight') {
          c = Math.min(8, c + 1)
          selectCell(r, c)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedCell, isGameActive, notesModeActive, gridValues, initialValues, pencilNotes, difficulty]) // eslint-disable-line

  // --- STATS / HELP TRIGGERS ---
  const toggleHelp = () => {
    Swal.fire({
      title: '✦ CARA BERMAIN ✦',
      html: `
        <div style="font-family: var(--font-mono); font-size: 0.75rem; text-align: left; line-height: 1.6; color: var(--color-text);">
          <p>Sudoku dimainkan pada kisi 9x9, dibagi menjadi sub-kisi 3x3.</p>
          <p style="margin-top: 10px;">Aturan dasar:</p>
          <ul style="padding-left: 15px; margin-top: 5px;">
            <li>Setiap baris horizontal harus berisi angka 1-9 tanpa pengulangan.</li>
            <li>Setiap kolom vertikal harus berisi angka 1-9 tanpa pengulangan.</li>
            <li>Setiap sub-kisi 3x3 harus berisi angka 1-9 tanpa pengulangan.</li>
          </ul>
          <p style="margin-top: 10px;">Gunakan <b>Pencil Notes (N)</b> untuk menandai kemungkinan angka di dalam sel kosong.</p>
        </div>
      `,
      background: 'var(--color-bg-card)',
      color: 'var(--color-text)',
      confirmButtonText: 'MENGERTI',
      confirmButtonColor: 'var(--color-gold)',
      customClass: { popup: 'ornate-border classic-card' }
    })
  }

  const toggleStats = () => {
    const easyBest = localStorage.getItem('logicall_sudoku_best_easy')
    const mediumBest = localStorage.getItem('logicall_sudoku_best_medium')
    const hardBest = localStorage.getItem('logicall_sudoku_best_hard')
    const expertBest = localStorage.getItem('logicall_sudoku_best_expert')

    Swal.fire({
      title: '✦ REKOR SUDOKU ✦',
      html: `
        <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--color-text); text-align: left;">
          <div style="margin-bottom: 8px; display: flex; justify-content: space-between;">
            <span>EASY:</span> <strong>${easyBest ? formatTime(parseInt(easyBest)) : '-'}</strong>
          </div>
          <div style="margin-bottom: 8px; display: flex; justify-content: space-between;">
            <span>MEDIUM:</span> <strong>${mediumBest ? formatTime(parseInt(mediumBest)) : '-'}</strong>
          </div>
          <div style="margin-bottom: 8px; display: flex; justify-content: space-between;">
            <span>HARD:</span> <strong>${hardBest ? formatTime(parseInt(hardBest)) : '-'}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>EXPERT:</span> <strong>${expertBest ? formatTime(parseInt(expertBest)) : '-'}</strong>
          </div>
        </div>
      `,
      background: 'var(--color-bg-card)',
      color: 'var(--color-text)',
      confirmButtonText: 'TUTUP',
      confirmButtonColor: 'var(--color-gold)',
      customClass: { popup: 'ornate-border classic-card' }
    })
  }

  const formatTime = (seconds: number) => {
    const mm = Math.floor(seconds / 60).toString().padStart(2, '0')
    const ss = (seconds % 60).toString().padStart(2, '0')
    return `${mm}:${ss}`
  }

  // --- RENDERING GRID CELLS ---
  const conflicts = getBoardConflicts(gridValues)
  const selectedVal = selectedCell ? gridValues[selectedCell.r][selectedCell.c] : 0

  const renderCell = (r: number, c: number) => {
    const val = gridValues[r][c]
    const isGiven = initialValues[r][c] !== 0
    const isHint = hintBoard[r][c]
    const isSelected = selectedCell ? (selectedCell.r === r && selectedCell.c === c) : false

    const hasConflict = conflicts[r][c]

    // Peer selection highlight styles
    let isPeerSelectedBy: string | null = null
    Object.entries(remoteSelections).forEach(([cid, sel]) => {
      if (sel.r === r && sel.c === c) {
        isPeerSelectedBy = sel.username
      }
    })

    // Subgrid boundary formatting
    let borderRight = '1px solid var(--color-border)'
    let borderBottom = '1px solid var(--color-border)'
    if (c === 2 || c === 5) borderRight = '2px solid var(--color-gold-dim)'
    if (r === 2 || r === 5) borderBottom = '2px solid var(--color-gold-dim)'

    let bg = 'transparent'
    let textColor = 'var(--color-ivory)'
    let fontWeight = 'normal'

    if (isGiven) {
      bg = 'rgba(201, 162, 39, 0.04)'
      textColor = 'var(--color-ivory-dim)'
      fontWeight = 'bold'
    } else if (isHint) {
      textColor = 'var(--color-gold)'
      fontWeight = 'bold'
    } else if (val !== 0) {
      textColor = '#4ade80'
    }

    // Matching value highlights
    if (val !== 0 && val === selectedVal && !isSelected) {
      bg = 'rgba(201, 162, 39, 0.38)'
    } else if (selectedCell) {
      const inSameRow = (r === selectedCell.r)
      const inSameCol = (c === selectedCell.c)
      const inSameBox = (Math.floor(r / 3) === Math.floor(selectedCell.r / 3) &&
                         Math.floor(c / 3) === Math.floor(selectedCell.c / 3))
      if (inSameRow || inSameCol || inSameBox) {
        bg = 'rgba(201, 162, 39, 0.22)'
      }
    }

    if (isSelected) {
      bg = 'rgba(201, 162, 39, 0.6)'
    } else if (isPeerSelectedBy) {
      bg = 'rgba(109, 40, 217, 0.3)'
    }

    if (hasConflict && val !== 0 && !isGiven) {
      bg = 'rgba(239, 68, 68, 0.15)'
      textColor = '#f87171'
    }

    return (
      <div
        key={`${r}-${c}`}
        onClick={() => selectCell(r, c)}
        style={{
          borderRight,
          borderBottom,
          background: bg,
          color: textColor,
          fontWeight: fontWeight as any,
        }}
        className={`w-9 h-9 sm:w-11 sm:h-11 relative flex items-center justify-center cursor-pointer select-none text-xs sm:text-sm font-mono transition-colors duration-150 group`}
      >
        {isPeerSelectedBy && (
          <div className="absolute -top-3.5 left-0 bg-violet-800 text-[7px] text-white px-1 rounded z-25 pointer-events-none uppercase tracking-wide whitespace-nowrap">
            {isPeerSelectedBy}
          </div>
        )}

        {val !== 0 ? (
          val
        ) : (
          <div className="grid grid-cols-3 grid-rows-3 w-full h-full p-0.5 pointer-events-none opacity-60">
            {Array.from({ length: 9 }).map((_, idx) => {
              const noteNum = idx + 1
              const hasNote = pencilNotes[r][c].includes(noteNum)
              return (
                <span
                  key={noteNum}
                  style={{ visibility: hasNote ? 'visible' : 'hidden' }}
                  className="text-[7px] sm:text-[9px] text-center font-bold text-amber-500 leading-none flex items-center justify-center"
                >
                  {noteNum}
                </span>
              )
            })}
          </div>
        )}
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
        title="Sudoku"
        subtitle="Game asah otak matematika klasik"
        connectionStatus={isMultiplayer ? (isHost ? `Host: ${roomCode}` : `Tamu: ${roomCode}`) : 'Mode Solo'}
        connectionDot={isMultiplayer ? (isHost ? 'host' : 'guest') : 'solo'}
        playerRoleBadge={isMultiplayer ? (isHost ? 'HOST' : 'TAMU') : null}
        onBack={() => {
          leaveVersusRoom()
          router.push('/')
        }}
        onRestart={resetBoard}
        onStats={toggleStats}
        onHelp={toggleHelp}
        username={username}
        onUsernameChange={handleUsernameChange}
      />

      {/* Lobby Panel */}
      <MultiplayerLobby
        gameKey="Sudoku"
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
        startBtnLabel="Mulai Co-op"
        startBtnDisabled={players.length < 2 || isStartingGame || isGameActive || countdownActive}
        canStart={players.length >= 2}
        showRoomInfo={showRoomInfo}
        shareLink={shareLink}
        onCopyRoomCode={copyRoomCode}
        onCopyRoomLink={copyRoomCode}
        soloSettingsSlot={
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold" style={{ color: 'var(--color-gold)' }}>Tingkat Kesulitan</span>
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Pilih tingkat kerumitan papan</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={difficulty}
                onChange={e => handleDifficultyChange(e.target.value)}
                className="bg-transparent border border-neutral-800 rounded text-xs px-2.5 py-1.5 focus:outline-none"
                style={{ color: 'var(--color-ivory)', background: '#0a0804' }}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
              </select>
            </div>
          </div>
        }
      />

      {/* Main Boards Area */}
      <main className="flex-grow flex flex-col md:flex-row items-center justify-center p-4 max-w-4xl mx-auto w-full gap-6 md:gap-12">
        {/* Sudoku Grid */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center px-1 text-[10px]" style={{ fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>MISTAKES: <strong style={{ color: mistakesCount > 0 ? '#f87171' : 'var(--color-ivory)' }}>{mistakesCount}/3</strong></span>
            <span style={{ color: 'var(--color-text-muted)' }}>TIME: <strong id="timer-display" style={{ color: 'var(--color-gold)' }}>{formatTime(secondsElapsed)}</strong></span>
          </div>

          <div
            id="sudoku-grid"
            className="grid grid-cols-9 grid-rows-9 p-1 rounded classic-card overflow-hidden"
            style={{
              border: '2px solid var(--color-gold-dim)',
            }}
          >
            {Array.from({ length: 9 }).map((_, r) =>
              Array.from({ length: 9 }).map((_, c) => renderCell(r, c))
            )}
          </div>
        </div>

        {/* Input / Control Buttons Panel */}
        <div className="flex flex-col gap-4 w-full max-w-[280px]">
          {/* Numbers Grid (1-9) */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                onClick={() => inputNumber(num)}
                className="brass-btn h-12 text-sm font-bold flex items-center justify-center rounded select-none cursor-pointer active:scale-95"
              >
                {num}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => setNotesModeActive(prev => !prev)}
                className="flex-1 py-3 px-2 rounded font-mono text-[9px] uppercase tracking-wide font-bold flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer border active:scale-95"
                style={{
                  background: notesModeActive ? 'var(--color-gold-dim)' : 'linear-gradient(180deg, #3a2a08, #1e1508)',
                  borderColor: notesModeActive ? 'var(--color-gold)' : 'var(--color-gold-dim)',
                  color: notesModeActive ? 'var(--color-ivory)' : 'var(--color-gold-light)',
                }}
              >
                <i className="fa-solid fa-pencil" />
                Notes {notesModeActive ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={eraseSelectedCell}
                className="flex-1 py-3 px-2 rounded font-mono text-[9px] uppercase tracking-wide font-bold flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer border active:scale-95"
                style={{
                  background: 'linear-gradient(180deg, #6b1212, #3d0a0a)',
                  borderColor: '#8b1a1a',
                  color: '#ffb3b3',
                }}
              >
                <i className="fa-solid fa-eraser" />
                Hapus
              </button>
            </div>

            <button
              onClick={handleHint}
              disabled={hintsRemaining <= 0}
              className="w-full py-3 px-2 rounded font-mono text-[9px] uppercase tracking-wide font-bold flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer border active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(180deg, #1e1508, #0a0804)',
                borderColor: 'var(--color-gold-dim)',
                color: 'var(--color-gold)',
              }}
            >
              <i className="fa-solid fa-lightbulb" />
              Bantuan Hint ({hintsRemaining})
            </button>
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
