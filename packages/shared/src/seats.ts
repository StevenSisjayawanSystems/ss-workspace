import { FURNITURE, zoneAt, type Furniture, type ZoneId } from './office'
import { nearestWalkable, type Point } from './pathfinding'

// A place to sit. Sitting down joins the voice channel of the room the seat is in.
export interface Seat {
  id: string
  x: number
  z: number
  // Avatar heading in radians; 0 looks towards +z.
  facing: number
  zone: ZoneId
  // How far below standing height the sitter rests: 0 for chairs, negative for cushions on the ground.
  drop: number
}

// Rooms where sitting does not open a call.
export const QUIET_ZONES: ZoneId[] = ['library', 'meditation']

// Seats in each piece's own frame as [x, z, facing], before the piece is turned and placed.
const ring = (count: number, radius: number, offset: number): [number, number, number][] =>
  Array.from({ length: count }, (_, k) => {
    const a = (k / count) * Math.PI * 2 + offset
    return [Math.cos(a) * radius, Math.sin(a) * radius, Math.atan2(-Math.cos(a), -Math.sin(a))]
  })

const LOCAL: Partial<Record<Furniture['type'], [number, number, number][]>> = {
  chair: [[0, 0, 0]],
  armchair: [[0, 0.06, 0]],
  sofa: [[-0.42, 0.06, 0], [0.42, 0.06, 0]],
  bench: [[-0.45, 0, 0], [0.45, 0, 0]],
  roundTable: ring(6, 1.72, Math.PI / 6),
  table: ring(4, 1.18, Math.PI / 4),
  meditationCircle: ring(6, 1.65, Math.PI / 6),
  picnic: [[-0.42, 0.78, Math.PI], [0.42, 0.78, Math.PI], [-0.42, -0.78, 0], [0.42, -0.78, 0]],
}

export const SEATS: Seat[] = FURNITURE.flatMap((f, i) => {
  const zone = zoneAt(Math.round(f.x), Math.round(f.z)) ?? zoneAt(Math.floor(f.x), Math.floor(f.z))
  if (!zone) return []
  const turn = ((f.rot ?? 0) * Math.PI) / 2
  const cos = Math.cos(turn), sin = Math.sin(turn)
  return (LOCAL[f.type] ?? []).map(([lx, lz, facing], k) => ({
    id: `${f.type}-${i}-${k}`,
    x: f.x + lx * cos + lz * sin,
    z: f.z - lx * sin + lz * cos,
    facing: facing + turn,
    zone,
    drop: f.type === 'meditationCircle' ? -0.3 : 0,
  }))
})

const byId = new Map(SEATS.map((s) => [s.id, s]))
export const seatById = (id: string): Seat | undefined => byId.get(id)

// Where you end up when you get up: the nearest free floor beside the seat.
export const standSpot = (seat: Seat): Point => nearestWalkable(seat.x, seat.z) ?? { x: seat.x, z: seat.z }

// How close you must be to sit down.
export const SIT_REACH = 2.2
