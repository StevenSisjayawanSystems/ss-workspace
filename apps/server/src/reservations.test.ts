import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESKS, SEATS } from '@guildhouse/shared'
import {
  Booking,
  ClosedDoor,
  DeskClaim,
  KNOCK,
  ReservationStore,
  readReservations,
  snapshot,
  admit,
  bookRoom,
  cancelBooking,
  claimDesk,
  closeDoor,
  doorClosed,
  expire,
  openDoor,
  releaseDesk,
  renamed,
  reopenEmpty,
  seatRefusal,
} from './reservations'

const lists = () => ({ desks: [] as DeskClaim[], bookings: [] as Booking[], doors: [] as ClosedDoor[] })
const MIN = 60_000

describe('desks', () => {
  it('gives each person one workroom desk, and keeps its chair for them', () => {
    const s = lists()
    expect(claimDesk(s, 'bench-1', 'Ada')).toMatch(/Main Workroom/)
    expect(claimDesk(s, DESKS[0].id, 'Ada')).toBeNull()
    expect(claimDesk(s, DESKS[0].id, 'Ben')).toBe("That desk is Ada's")
    expect(seatRefusal(s, DESKS[0].seatId, 'workroom', 'Ben', false)).toBe("That desk is Ada's")
    expect(seatRefusal(s, DESKS[0].seatId, 'workroom', 'Ada', false)).toBeNull()
    expect(seatRefusal(s, DESKS[1].seatId, 'workroom', 'Ben', false)).toBeNull()

    // Moving to another desk frees the first.
    expect(claimDesk(s, DESKS[3].id, 'Ada')).toBeNull()
    expect(s.desks.map((c) => c.deskId)).toEqual([DESKS[3].id])
    expect(releaseDesk(s, 'Ada')).toBe(true)
    expect(releaseDesk(s, 'Ada')).toBe(false)
  })
})

describe('closed doors', () => {
  const seat = SEATS.find((x) => x.zone === 'councilA')!

  it('makes newcomers knock, lets in whoever is admitted, and never stops people already inside', () => {
    const s = lists()
    expect(closeDoor(s, 'tavern', 'Ada')).toMatch(/no door/)
    expect(seatRefusal(s, seat.id, 'councilA', 'Ben', false)).toBeNull()
    expect(closeDoor(s, 'councilA', 'Ada')).toBeNull()
    expect(closeDoor(s, 'councilA', 'Cy')).toBeNull()
    expect(s.doors).toHaveLength(1)
    expect(doorClosed(s, 'councilA')).toBe(true)

    expect(seatRefusal(s, seat.id, 'councilA', 'Ben', false)).toBe(KNOCK)
    // Someone seated in the room changing chairs is not a newcomer.
    expect(seatRefusal(s, seat.id, 'councilA', 'Cy', true)).toBeNull()
    admit(s, 'councilA', 'Ben')
    admit(s, 'councilA', 'Ben')
    expect(seatRefusal(s, seat.id, 'councilA', 'Ben', false)).toBeNull()
    expect(seatRefusal(s, seat.id, 'councilA', 'Dee', false)).toBe(KNOCK)
    // The other chamber is unaffected.
    expect(seatRefusal(s, 'x', 'councilB', 'Dee', false)).toBeNull()
  })

  it('opens when asked, and by itself once the room is empty', () => {
    const s = lists()
    closeDoor(s, 'councilA', 'Ada')
    closeDoor(s, 'councilB', 'Ada')
    expect(reopenEmpty(s, new Set(['councilA', 'councilB']))).toBe(false)
    expect(reopenEmpty(s, new Set(['councilB']))).toBe(true)
    expect(s.doors.map((d) => d.zone)).toEqual(['councilB'])
    expect(openDoor(s, 'councilB')).toBe(true)
    expect(openDoor(s, 'councilB')).toBe(false)
  })
})

describe('room schedule', () => {
  it('books without overlaps, now or ahead, and does not keep anyone out', () => {
    const s = lists()
    const seat = SEATS.find((x) => x.zone === 'councilA')!
    expect(bookRoom(s, 'tavern', undefined, 30, 'Ada', 0)).toMatch(/cannot be reserved/)
    expect(bookRoom(s, 'councilA', undefined, 7, 'Ada', 0)).toMatch(/offered lengths/)
    expect(bookRoom(s, 'councilA', 60 * MIN, 60, 'Ada', 0)).toBeNull()
    expect(s.bookings[0]).toMatchObject({ start: 60 * MIN, until: 120 * MIN, by: 'Ada' })
    expect(seatRefusal(s, seat.id, 'councilA', 'Ben', false)).toBeNull()

    expect(bookRoom(s, 'councilA', 90 * MIN, 30, 'Ben', 0)).toBe('That time is taken by Ada')
    expect(bookRoom(s, 'councilA', 30 * MIN, 60, 'Ben', 0)).toBe('That time is taken by Ada')
    expect(bookRoom(s, 'councilA', 90 * MIN, 30, 'Ada', 0)).toBe('You already have that time')
    // Back to back is fine, and so is the other room at the same time.
    expect(bookRoom(s, 'councilA', 120 * MIN, 30, 'Ben', 0)).toBeNull()
    expect(bookRoom(s, 'councilB', 60 * MIN, 60, 'Ben', 0)).toBeNull()
    expect(bookRoom(s, 'councilA', 8 * 24 * 60 * MIN, 30, 'Ben', 0)).toMatch(/7 days ahead/)
    // A start in the past means now.
    expect(bookRoom(s, 'councilB', -5 * MIN, 30, 'Ada', 0)).toBeNull()
    expect(s.bookings.at(-1)).toMatchObject({ start: 0, until: 30 * MIN })
    expect(expire(s, 30 * MIN)).toBe(true)
    expect(s.bookings).toHaveLength(3)
  })

  it('can only be cancelled by whoever booked it, and survives a restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guildhouse-res-'))
    const s = lists()
    claimDesk(s, DESKS[2].id, 'Ada')
    bookRoom(s, 'councilB', 10 * MIN, 60, 'Ada', 0)
    bookRoom(s, 'councilA', undefined, 30, 'Ada', 0)
    new ReservationStore(dir).save(s)

    const again = lists()
    new ReservationStore(dir).restore(again, 45 * MIN)
    expect(again.desks.map((c) => [c.deskId, c.owner])).toEqual([[DESKS[2].id, 'Ada']])
    // The booking that ended while the server was down is gone; the later one remains.
    expect(again.bookings.map((b) => b.zone)).toEqual(['councilB'])

    expect(cancelBooking(again, again.bookings[0].id, 'Ben')).toBe(false)
    expect(cancelBooking(again, again.bookings[0].id, 'Ada')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('a desk belongs to an account', () => {
  it('follows its owner through a change of name and comes back from what was saved', () => {
    const s = { desks: [] as DeskClaim[], bookings: [] as Booking[], doors: [] as ClosedDoor[] }
    const [first, second] = DESKS
    expect(claimDesk(s, first.id, 'Ada', 'm1')).toBeNull()
    expect(claimDesk(s, second.id, 'Bo')).toBeNull()
    // The account's desk takes the new name; nobody else's is touched.
    expect(renamed(s, 'm1', 'Ada', 'Countess')).toBe(true)
    expect(s.desks.map((c) => [c.deskId, c.owner, c.member])).toEqual([[first.id, 'Countess', 'm1'], [second.id, 'Bo', '']])
    expect(renamed(s, 'm1', 'Countess', 'Countess')).toBe(false)
    const again = { desks: [] as DeskClaim[], bookings: [] as Booking[], doors: [] as ClosedDoor[] }
    new ReservationStore(undefined).restore(again, 0, readReservations(JSON.parse(JSON.stringify(snapshot(s)))))
    expect(again.desks.map((c) => [c.deskId, c.owner, c.member])).toEqual([[first.id, 'Countess', 'm1'], [second.id, 'Bo', '']])
  })
})
