import { describe, expect, it } from 'vitest'
import { ROOMS, SEATS, SIT_REACH, SPAWN, findPath, seatById, standSpot, zoneAt } from './index'

describe('seats', () => {
  it('has unique ids and seats in every room', () => {
    expect(new Set(SEATS.map((s) => s.id)).size).toBe(SEATS.length)
    for (const r of ROOMS) expect(SEATS.some((s) => s.zone === r.id), r.id).toBe(true)
    expect(seatById(SEATS[0].id)).toBe(SEATS[0])
  })

  it('every seat can be walked up to from spawn, within reach, in its own room', () => {
    for (const s of SEATS) {
      const spot = standSpot(s)
      expect(findPath(SPAWN, spot), s.id).not.toBeNull()
      expect(Math.hypot(spot.x - s.x, spot.z - s.z), s.id).toBeLessThan(SIT_REACH)
      expect(zoneAt(spot.x, spot.z), s.id).toBe(s.zone)
    }
  })

  it('desk chairs face their desks and council stools face the table', () => {
    const chair = SEATS.find((s) => s.id.startsWith('chair-'))!
    // First desk row sits at z=9 with chairs at z=10, so the sitter looks towards -z.
    expect(Math.cos(chair.facing)).toBeCloseTo(-1)
    for (const s of SEATS.filter((s) => s.zone === 'councilA')) {
      const toTable = Math.atan2(12 - s.x, 3.5 - s.z)
      expect(Math.cos(s.facing - toTable)).toBeCloseTo(1)
    }
  })
})
