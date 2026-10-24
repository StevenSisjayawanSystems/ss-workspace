import { describe, expect, it } from 'vitest'
import { BOOKABLE_ZONES, DESKS, ROOMS, SEATS, deskById, deskOfSeat, seatById } from './index'

describe('desks', () => {
  it('lists every workroom desk with its own chair right beside it', () => {
    expect(DESKS).toHaveLength(10)
    expect(new Set(DESKS.map((d) => d.seatId)).size).toBe(10)
    for (const d of DESKS) {
      const seat = seatById(d.seatId)!
      expect(seat.zone).toBe('workroom')
      expect(Math.hypot(seat.x - d.x, seat.z - d.z)).toBeLessThan(1.2)
      expect(deskById(d.id)).toBe(d)
      expect(deskOfSeat(d.seatId)).toBe(d)
    }
  })

  it('leaves seats elsewhere unclaimable, and only offers real rooms for booking', () => {
    for (const s of SEATS.filter((s) => s.zone !== 'workroom')) expect(deskOfSeat(s.id)).toBeUndefined()
    for (const z of BOOKABLE_ZONES) expect(ROOMS.some((r) => r.id === z && !r.outdoor)).toBe(true)
  })
})
