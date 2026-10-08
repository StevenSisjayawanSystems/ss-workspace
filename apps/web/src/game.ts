import { create } from 'zustand'
import { SIT_REACH, SPAWN, seatById, standSpot, type ZoneId } from '@guildhouse/shared'
import { DEFAULT_LOOK, type AvatarLook } from './look'

// Per-frame state lives in plain objects so reading it never triggers React renders.
export const player = { x: SPAWN.x, z: SPAWN.z, facing: 0, moving: false }

// Joystick vector in screen space: x right, y up, each in [-1, 1].
export const input = { jx: 0, jy: 0 }

export interface Profile {
  name: string
  look: AvatarLook
}

const PROFILE_KEY = 'guildhouse.profile'

export function loadProfile(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null')
    if (saved?.name) return { name: String(saved.name), look: { ...DEFAULT_LOOK, ...saved.look } }
  } catch {
    // Unreadable or blocked storage: fall through to defaults.
  }
  return { name: '', look: DEFAULT_LOOK }
}

const STATUS_KEY = 'guildhouse.status'
function loadStatus(): string {
  try {
    return (localStorage.getItem(STATUS_KEY) ?? '').slice(0, 40)
  } catch {
    return ''
  }
}
export function saveStatus(status: string) {
  try {
    localStorage.setItem(STATUS_KEY, status)
  } catch {
    // Not remembered next time; still applies now.
  }
}

interface GameState {
  profile: Profile | null
  enter: (profile: Profile) => void
  zone: ZoneId
  setZone: (zone: ZoneId) => void
  // Bumping `n` lets the same destination be requested twice in a row.
  walkTarget: { x: number; z: number; n: number } | null
  walkTo: (x: number, z: number) => void
  // Seat we are in (as confirmed by the server), the one we are walking to, and the one under the pointer.
  seat: string | null
  pendingSeat: string | null
  hoverSeat: string | null
  setHoverSeat: (id: string | null) => void
  jukeOpen: boolean
  // Whose profile card is open (a session id, or 'self'), and whether the bulletin board is open.
  profileOf: string | null
  boardOpen: boolean
  // What you are up to, shown to others. Empty means nothing in particular.
  status: string
  setJukeOpen: (open: boolean) => void
  // Incremented when the server moves us, so any route in progress is dropped.
  snaps: number
  snapTo: (x: number, z: number) => void
}

export const useGame = create<GameState>((set, get) => ({
  profile: null,
  enter: (profile) => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    } catch {
      // Not being able to remember the profile is fine.
    }
    set({ profile })
  },
  zone: 'entrance',
  setZone: (zone) => set({ zone }),
  walkTarget: null,
  walkTo: (x, z) => set({ pendingSeat: null, walkTarget: { x, z, n: (get().walkTarget?.n ?? 0) + 1 } }),
  seat: null,
  pendingSeat: null,
  hoverSeat: null,
  setHoverSeat: (hoverSeat) => set({ hoverSeat }),
  jukeOpen: false,
  profileOf: null,
  boardOpen: false,
  status: loadStatus(),
  setJukeOpen: (jukeOpen) => set({ jukeOpen }),
  snaps: 0,
  snapTo: (x, z) => {
    player.x = x
    player.z = z
    set({ snaps: get().snaps + 1 })
  },
}))

// Reports whether (x, z) is close enough to sit in the seat.
export const inReach = (seatId: string) => {
  const seat = seatById(seatId)
  return !!seat && Math.hypot(seat.x - player.x, seat.z - player.z) <= SIT_REACH
}

// Heads for a seat; Player sits down on arrival.
export function walkToSeat(seatId: string) {
  const seat = seatById(seatId)
  if (!seat) return
  const spot = standSpot(seat)
  useGame.getState().walkTo(spot.x, spot.z)
  useGame.setState({ pendingSeat: seatId })
}

// Handle for tests and console poking in development.
if (import.meta.env.DEV) Object.assign(window, { __game: { player, input, useGame } })
