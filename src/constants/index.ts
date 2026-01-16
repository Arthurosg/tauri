/**
 * Constantes e configurações compartilhadas do ProPhase
 */

export type GameDefinition = {
  id: string
  name: string
  font: string
}

export const GAMES: GameDefinition[] = [
  { id: 'valorant', name: 'VALORANT', font: 'Rajdhani' },
  { id: 'lol', name: 'LEAGUE OF LEGENDS', font: 'Inter' },
  { id: 'tft', name: 'TEAMFIGHT TACTICS', font: 'Inter' },
  { id: 'cs2', name: 'COUNTER-STRIKE 2', font: 'Orbitron' },
]

export const WINDOW_SIZES = {
  MAIN: { width: 420, height: 660 },
  OVERLAY: { width: 70, height: 70 },
} as const

export const TIMINGS = {
  OVERLAY_AUTO_SWITCH: 1500,
  GAME_CLOSED_DELAY: 3000,
  OVERLAY_TRANSPARENT_DELAY: 2000,
  OAUTH_TIMEOUT: 5 * 60 * 1000,
} as const
