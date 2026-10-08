import { FURNITURE, zoneAt, type ZoneId } from './office'
import { seatById } from './seats'

// A desk someone can make their own. Only the desks in the main workroom can be claimed.
export interface Desk {
  id: string
  x: number
  z: number
  // The chair that belongs to this desk; once the desk is claimed, only its owner may sit there.
  seatId: string
}

export const DESK_ZONE: ZoneId = 'workroom'

// Each workroom desk is listed in the floor plan immediately before its chair.
export const DESKS: Desk[] = FURNITURE.flatMap((f, i) => {
  if (f.type !== 'desk' || zoneAt(Math.round(f.x), Math.round(f.z)) !== DESK_ZONE) return []
  const seatId = `chair-${i + 1}-0`
  return seatById(seatId) ? [{ id: `desk-${i}`, x: f.x, z: f.z, seatId }] : []
})

const byId = new Map(DESKS.map((d) => [d.id, d]))
const bySeat = new Map(DESKS.map((d) => [d.seatId, d]))
export const deskById = (id: string): Desk | undefined => byId.get(id)
export const deskOfSeat = (seatId: string): Desk | undefined => bySeat.get(seatId)

// Rooms that can be booked for a private meeting, and for how long.
export const BOOKABLE_ZONES: ZoneId[] = ['councilA', 'councilB']
export const BOOKING_MINUTES = [30, 60, 120]
