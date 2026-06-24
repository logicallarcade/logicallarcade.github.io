/** A presence entry from the Supabase arcade-lobby channel */
export interface LobbyPresence {
  clientId: string
  username?: string
  status?: 'lobby' | 'in-game'
  onlineAt?: string
  // Room info (only for game hosts who shared their room)
  roomCode?: string
  game?: 'wordle' | 'sudoku' | 'bingo' | 'typerace'
  hostName?: string
  playerCount?: number
  maxPlayers?: number
  updatedAt?: string
}

export interface ActiveRoom {
  roomCode: string
  game: 'wordle' | 'sudoku' | 'bingo' | 'typerace'
  hostName: string
  playerCount: number
  maxPlayers: number
}

export type GameKey = 'wordle' | 'sudoku' | 'bingo' | 'typerace'

export interface GameConfig {
  key: GameKey
  title: string
  description: string
  badge: string
  iconClass: string
  href: string
  thumbnailSrc: string
  accentColor: string
  badgeClass: string
  isActive: true
}

export interface ComingSoonConfig {
  title: string
  description: string
  iconClass: string
  accentColor: string
  isActive: false
}

export type CardConfig = GameConfig | ComingSoonConfig
